import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import multer from "multer";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { v2 as cloudinary } from "cloudinary";
const { CloudinaryStorage } = require("multer-storage-cloudinary");

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);
const prisma = new PrismaClient();

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const pubClient = new Redis(redisUrl);
pubClient.on("error", (err) => console.error("Redis pubClient error:", err));
const subClient = pubClient.duplicate();
subClient.on("error", (err) => console.error("Redis subClient error:", err));
const redisClient = pubClient.duplicate();
redisClient.on("error", (err) => console.error("Redis redisClient error:", err));

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-for-jwt";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

io.adapter(createAdapter(pubClient, subClient));

app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

let storage;
if (process.env.CLOUDINARY_URL) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'peerly_avatars',
      allowedFormats: ['jpeg', 'png', 'jpg'],
    } as any,
  });
} else {
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = './uploads';
      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir);
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
  });
}
const upload = multer({ storage });

import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transporter.verify((err, success) => {
    if (err) {
        console.error("SMTP Verify Error:", err);
    } else {
        console.log("SMTP Ready");
    }
});

const requireAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return res.status(401).json({ error: "Unauthorized" });
    req.user = decoded;
    next();
  });
};

// --- RATE LIMITERS ---
const limiterOptions = {
  store: new RedisStore({
    // @ts-expect-error - Known issue with rate-limit-redis type definitions
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  standardHeaders: true,
  legacyHeaders: false,
};

// Max 50 per hour for guests/auth endpoints
const authLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: "Too many authentication requests, please try again later."
});

app.use("/auth", authLimiter);

// --- REST API ENDPOINTS ---

app.post("/auth/guest", async (req, res) => {
  try {
    const adjectives = ["Swift", "Calm", "Brave", "Quiet", "Fast", "Night"];
    const nouns = ["Panda", "Otter", "Eagle", "Falcon", "Turtle", "Fox"];
    const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 100)}`;
    
    const guest = await prisma.guestSession.create({
      data: {
        random_username: randomName,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
    });

    const token = jwt.sign({ id: guest.id, type: 'guest', username: randomName }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: { id: guest.id, username: randomName, type: 'guest' } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to create guest" });
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3),
  date_of_birth: z.string(),
  otp: z.string().length(6)
});

app.post("/auth/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(", ") });

    const { email, password, username, date_of_birth, otp } = parsed.data;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    if (existing) return res.status(400).json({ error: "Email or username taken" });

    // Verify OTP
    const otpRecord = await prisma.otp.findUnique({ where: { email } });
    if (!otpRecord) return res.status(400).json({ error: "No pending OTP for this email" });
    if (otpRecord.code !== otp) return res.status(400).json({ error: "Invalid code" });
    if (otpRecord.expires_at < new Date()) return res.status(400).json({ error: "Code expired" });

    await prisma.otp.delete({ where: { email } });

    const password_hash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: {
        auth_provider: "email",
        email,
        username,
        password_hash,
        date_of_birth: new Date(date_of_birth)
      }
    });

    const token = jwt.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, type: 'user' } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await prisma.user.findFirst({ 
      where: { 
        OR: [
          { email: identifier },
          { username: identifier }
        ] 
      } 
    });
    if (!user || !user.password_hash) return res.status(400).json({ error: "Invalid credentials" });

    const isValid = await argon2.verify(user.password_hash, password);
    if (!isValid) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, type: 'user' } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/auth/otp/send", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Generate a 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store in DB, update if exists
    await prisma.otp.upsert({
      where: { email },
      update: { code, expires_at, created_at: new Date() },
      create: { email, code, expires_at }
    });

    // Send email
    await transporter.sendMail({
      from: `"Peerly" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your Peerly Login Code",
      html: `
        <div style="font-family: sans-serif; text-align: center; max-width: 500px; margin: auto;">
          <h2>Welcome to Peerly!</h2>
          <p>Your one-time login code is:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #00d2ff; background: #262628; padding: 20px; border-radius: 10px;">${code}</h1>
          <p>This code will expire in 5 minutes.</p>
        </div>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send OTP email" });
  }
});

app.post("/auth/otp/verify", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and code are required" });

    const otp = await prisma.otp.findUnique({ where: { email } });
    if (!otp) return res.status(400).json({ error: "No pending OTP for this email" });
    
    if (otp.code !== code) return res.status(400).json({ error: "Invalid code" });
    if (otp.expires_at < new Date()) return res.status(400).json({ error: "Code expired" });

    // Mark used by deleting
    await prisma.otp.delete({ where: { email } });

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = jwt.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, isNewUser: false, token, user: { id: user.id, username: user.username, type: 'user' } });
    } else {
      return res.json({ 
        success: true, 
        isNewUser: true,
        email
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error verifying OTP" });
  }
});

app.post("/auth/google/verify", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing credential" });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return res.status(400).json({ error: "Invalid token payload" });

    const email = payload.email;
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // User exists, log them in
      const token = jwt.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, isNewUser: false, token, user: { id: user.id, username: user.username, type: 'user' } });
    } else {
      // New user, send back data for Complete Profile step
      return res.json({
        success: true,
        isNewUser: true,
        googleData: {
          email: payload.email,
          google_id: payload.sub,
          name: payload.name,
          picture: payload.picture
        }
      });
    }
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

app.post("/auth/google/register", upload.single('avatar'), async (req, res) => {
  try {
    const { email, google_id, username, date_of_birth, name } = req.body;
    
    if (!email || !google_id || !username || !date_of_birth) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });

    if (existingUser) return res.status(400).json({ error: "Email or username already taken" });

    let avatar_url = req.body.picture || null;
    if (req.file) {
      if (process.env.CLOUDINARY_URL) {
        avatar_url = req.file.path;
      } else {
        avatar_url = `/uploads/${req.file.filename}`;
      }
    }

    const user = await prisma.user.create({
      data: {
        auth_provider: "google",
        email,
        google_id,
        username,
        display_name: name,
        avatar_url,
        date_of_birth: new Date(date_of_birth)
      }
    });

    const token = jwt.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, type: 'user' } });
  } catch (error) {
    console.error("Google Register Error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// --- USER & FRIEND ENDPOINTS (PHASE 4) ---

app.get("/users/me", requireAuth, async (req: any, res: any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, display_name: true, bio: true, avatar_url: true }
    });
    const friendshipsA = await prisma.friendship.findMany({
      where: { user_a_id: req.user.id },
      include: { user_b: { select: { id: true, username: true, display_name: true, avatar_url: true } } }
    });
    const friendshipsB = await prisma.friendship.findMany({
      where: { user_b_id: req.user.id },
      include: { user_a: { select: { id: true, username: true, display_name: true, avatar_url: true } } }
    });
    
    // Normalize friendships
    const activeFriends = [
      ...friendshipsA.map(f => ({ ...f, friend: f.user_b })),
      ...friendshipsB.map(f => ({ ...f, friend: f.user_a }))
    ];

    const pendingRequests = await prisma.friendRequest.findMany({
      where: { receiver_id: req.user.id, status: 'pending' },
      include: { sender: { select: { id: true, username: true, display_name: true, avatar_url: true } } }
    });
    
    res.json({ user, friendships: activeFriends, pendingRequests });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.put("/users/me", requireAuth, upload.single('avatar'), async (req: any, res: any) => {
  try {
    const { display_name, bio } = req.body;
    let avatar_url = undefined;

    if (req.file) {
      if (process.env.CLOUDINARY_URL) {
        avatar_url = req.file.path;
      } else {
        avatar_url = `/uploads/${req.file.filename}`;
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { display_name, bio, ...(avatar_url && { avatar_url }) }
    });
    res.json({ success: true, user: updated });
  } catch (e) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.delete("/users/me", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    // Delete friendships
    await prisma.friendship.deleteMany({
      where: { OR: [{ user_a_id: userId }, { user_b_id: userId }] }
    });
    // Delete friend requests
    await prisma.friendRequest.deleteMany({
      where: { OR: [{ sender_id: userId }, { receiver_id: userId }] }
    });
    // Delete messages
    await prisma.message.deleteMany({
      where: { sender_id: userId }
    });
    // Delete user
    await prisma.user.delete({
      where: { id: userId }
    });
    res.json({ success: true });
  } catch (e) {
    console.error("Delete user error:", e);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

app.post("/friends/request", requireAuth, async (req: any, res: any) => {
  try {
    const { targetUserId } = req.body;
    if (targetUserId === req.user.id) return res.status(400).json({ error: "Cannot add yourself" });

    const existingReq = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { sender_id: req.user.id, receiver_id: targetUserId },
          { sender_id: targetUserId, receiver_id: req.user.id }
        ],
        status: 'pending'
      }
    });
    if (existingReq) return res.status(400).json({ error: "Request already exists" });

    const existingFriend = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user_a_id: req.user.id, user_b_id: targetUserId },
          { user_a_id: targetUserId, user_b_id: req.user.id }
        ]
      }
    });
    if (existingFriend) return res.status(400).json({ error: "Already friends" });

    const request = await prisma.friendRequest.create({
      data: { sender_id: req.user.id, receiver_id: targetUserId, status: 'pending' }
    });
    
    // Notify the target user to refresh their dashboard
    io.to(targetUserId).emit('presence:update');
    
    res.json({ success: true, request });
  } catch (e) {
    res.status(500).json({ error: "Failed to send friend request" });
  }
});

app.post("/friends/respond", requireAuth, async (req: any, res: any) => {
  try {
    const { requestId, action } = req.body; // action: 'accept' | 'decline'
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    
    if (!request || request.receiver_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (action === 'accept') {
      await prisma.$transaction([
        prisma.friendRequest.update({
          where: { id: requestId },
          data: { status: 'accepted', responded_at: new Date() }
        }),
        prisma.friendship.create({
          data: { user_a_id: request.sender_id, user_b_id: request.receiver_id }
        })
      ]);
      // Notify the sender that their request was accepted
      io.to(request.sender_id).emit('presence:update');
    } else {
      await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'declined', responded_at: new Date() }
      });
      // Notify the sender that their request was declined
      io.to(request.sender_id).emit('presence:update');
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to respond to request" });
  }
});

app.get("/friends/:friendId/chat", requireAuth, async (req: any, res: any) => {
  try {
    const friendId = req.params.friendId;
    const userId = req.user.id;
    
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user_a_id: userId, user_b_id: friendId },
          { user_a_id: friendId, user_b_id: userId }
        ]
      }
    });

    if (!friendship) return res.status(403).json({ error: "Not friends" });

    let chatSession = await prisma.chatSession.findFirst({
      where: {
        type: "friend_chat",
        OR: [
          { participant_1_id: userId, participant_2_id: friendId },
          { participant_1_id: friendId, participant_2_id: userId }
        ]
      },
      include: { messages: { orderBy: { created_at: 'asc' } } }
    });

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: {
          type: "friend_chat",
          participant_1_type: "user",
          participant_1_id: userId,
          participant_2_type: "user",
          participant_2_id: friendId,
        },
        include: { messages: true }
      });
    }

    res.json({ success: true, chatSession });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load chat history" });
  }
});

// --- SOCKET.IO ---

// JWT Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  
  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return next(new Error("Authentication error"));
    // @ts-ignore
    socket.user = decoded;
    next();
  });
});

// Global queues are now dynamically generated based on type (e.g. queue:random_text:global)
const onlineUsers = new Map<string, string>(); // userId -> socketId

io.on("connection", (socket) => {
  // @ts-ignore
  const user = socket.user;
  console.log(`User connected: ${user.username} (${user.id})`);
  
  if (user.type === 'user') {
    onlineUsers.set(user.id, socket.id);
    io.emit("presence:update", { userId: user.id, status: "online" });
  }

  // Matchmaking
  socket.on("match:join", async (data, cb) => {
    try {
      const tags: string[] = data?.tags || [];
      const sessionType: string = data?.type || "random_text";
      const globalQueueKey = `queue:${sessionType}:global`;
      const userPayloadStr = JSON.stringify({ id: user.id, username: user.username });
      
      let waitingUser = null;

      // Helper to pop and validate
      const tryPopValidUser = async (queueKey: string) => {
        let poppedStr = await redisClient.lpop(queueKey);
        while (poppedStr) {
          const popped = JSON.parse(poppedStr);
          if (popped.id !== user.id) {
            const status = await redisClient.get(`user:${popped.id}:status`);
            if (status === 'waiting') {
              const sockets = await io.in(popped.id).fetchSockets();
              if (sockets.length > 0) {
                await redisClient.set(`user:${popped.id}:status`, 'matched');
                return popped;
              }
            }
          }
          poppedStr = await redisClient.lpop(queueKey);
        }
        return null;
      };

      if (tags.length > 0) {
        for (const tag of tags) {
          waitingUser = await tryPopValidUser(`queue:${sessionType}:tag:${tag}`);
          if (waitingUser) break;
        }
      } else {
        waitingUser = await tryPopValidUser(globalQueueKey);
      }
      
      if (waitingUser) {
        // Match found!
        await redisClient.set(`user:${user.id}:status`, 'matched');
        
        const chatSession = await prisma.chatSession.create({
          data: {
            type: sessionType,
            participant_1_type: "guest", // Assuming guest for now or dynamically resolving
            participant_1_id: waitingUser.id,
            participant_2_type: "guest",
            participant_2_id: user.id,
          }
        });
        
        const roomId = `room:${chatSession.id}`;
        socket.join(roomId);
        // @ts-ignore
        socket.currentRoom = roomId;
        // @ts-ignore
        socket.currentSession = chatSession.id;
        
        io.to(waitingUser.id).emit("session:start", { roomId, partnerId: user.id, sessionId: chatSession.id, partnerUsername: user.username });
        socket.emit("session:start", { roomId, partnerId: waitingUser.id, sessionId: chatSession.id, partnerUsername: waitingUser.username });
        if(cb && typeof cb === 'function') cb({ success: true, status: "matched", roomId });
      } else {
        await redisClient.set(`user:${user.id}:status`, 'waiting');
        if (tags.length > 0) {
          for (const tag of tags) {
            await redisClient.rpush(`queue:${sessionType}:tag:${tag}`, userPayloadStr);
          }
        } else {
          await redisClient.rpush(globalQueueKey, userPayloadStr);
        }
        socket.join(user.id);
        if(cb && typeof cb === 'function') cb({ success: true, status: "waiting" });
      }
    } catch (error) {
      console.error(error);
      if(cb && typeof cb === 'function') cb({ success: false, error: "Failed to join queue" });
    }
  });

  // WebRTC Signaling
  socket.on("webrtc:offer", (data) => {
    socket.to(data.roomId).emit("webrtc:offer", { offer: data.offer, senderId: user.id });
  });

  socket.on("webrtc:answer", (data) => {
    socket.to(data.roomId).emit("webrtc:answer", { answer: data.answer, senderId: user.id });
  });

  socket.on("webrtc:ice-candidate", (data) => {
    socket.to(data.roomId).emit("webrtc:ice-candidate", { candidate: data.candidate, senderId: user.id });
  });

  socket.on("session:joined", (data) => {
    const { roomId, sessionId } = data;
    socket.join(roomId);
    // @ts-ignore
    socket.currentRoom = roomId;
    // @ts-ignore
    socket.currentSession = sessionId;
  });

  socket.on("match:leave", async () => {
    await redisClient.set(`user:${user.id}:status`, 'offline');
    // Removing from all possible global queues just to be safe
    await redisClient.lrem(`queue:random_text:global`, 0, JSON.stringify({ id: user.id, username: user.username }));
    await redisClient.lrem(`queue:random_video:global`, 0, JSON.stringify({ id: user.id, username: user.username }));
  });

  socket.on("message:send", async (data) => {
    const { roomId, message, sessionId } = data;
    try {
      const msg = await prisma.message.create({
        data: {
          chat_session_id: sessionId,
          sender_type: user.type,
          sender_id: user.id,
          content: message,
          message_type: "text"
        }
      });
      io.to(roomId).emit("message:receive", msg);
    } catch (e) {
      console.error(e);
    }
  });

  socket.on("typing:start", (data) => {
    const { roomId } = data;
    socket.to(roomId).emit("typing:start", { senderId: user.id });
  });

  socket.on("typing:stop", (data) => {
    const { roomId } = data;
    socket.to(roomId).emit("typing:stop", { senderId: user.id });
  });

  socket.on("session:end", async (data) => {
    const { roomId, sessionId } = data;
    // @ts-ignore
    socket.currentRoom = null;
    // @ts-ignore
    socket.currentSession = null;
    try {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { ended_at: new Date(), end_reason: "user_left" }
      });
      io.to(roomId).emit("session:ended");
    } catch (e) {
      console.error(e);
    }
  });

  socket.on("disconnect", async () => {
    await redisClient.set(`user:${user.id}:status`, 'offline');
    await redisClient.lrem(`queue:random_text:global`, 0, JSON.stringify({ id: user.id, username: user.username }));
    await redisClient.lrem(`queue:random_video:global`, 0, JSON.stringify({ id: user.id, username: user.username }));
    
    // @ts-ignore
    if (socket.currentSession && socket.currentRoom) {
      // @ts-ignore
      const { currentSession, currentRoom } = socket;
      try {
        await prisma.chatSession.update({
          where: { id: currentSession },
          data: { ended_at: new Date(), end_reason: "disconnected" }
        });
        io.to(currentRoom).emit("session:ended");
      } catch (e) {
        console.error(e);
      }
    }

    console.log(`User disconnected: ${user.username}`);
    if (user.type === 'user') {
      onlineUsers.delete(user.id);
      io.emit("presence:update", { userId: user.id, status: "offline" });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
