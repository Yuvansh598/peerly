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
import crypto from "crypto";
import { EmailService } from "./services/email.service";
import { AnalyticsService } from "./services/analytics.service";

import { v2 as cloudinary } from "cloudinary";
const { CloudinaryStorage } = require("multer-storage-cloudinary");

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.error("FATAL: FRONTEND_URL environment variable is required in production.");
  process.exit(1);
}

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
AnalyticsService.init(redisClient);

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
const createRedisStore = (prefix: string) => {
  return new RedisStore({
    // @ts-expect-error - Known issue with rate-limit-redis type definitions
    sendCommand: (...args: string[]) => redisClient.call(...args),
    prefix: prefix,
  });
};

const globalAuthLimiter = rateLimit({
  store: createRedisStore("rl:global:"),
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: "Too many authentication requests, please try again later."
});

const loginLimiter = rateLimit({
  store: createRedisStore("rl:login:"),
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: "Too many login requests, please try again later."
});

const registerLimiter = rateLimit({
  store: createRedisStore("rl:register:"),
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: "Too many registration requests, please try again later."
});

const otpLimiter = rateLimit({
  store: createRedisStore("rl:otp:"),
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 60 * 1000,
  max: 3,
  message: "Too many OTP requests, please try again later."
});

// --- REST API ENDPOINTS ---

app.get("/health", async (req, res) => {
  let dbStatus = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (e) {
    dbStatus = "error";
  }
  
  res.json({
    status: "ok",
    database: dbStatus,
    email: "brevo"
  });
});

app.post("/auth/guest", globalAuthLimiter, async (req, res) => {
  try {
    let username = req.body.username;
    
    if (username) {
      username = username.trim();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        res.status(400).json({ success: false, error: "Username must be 3-20 characters, containing only letters, numbers, or underscores." });
        return;
      }
      
      const lowercase = username.toLowerCase();
      
      // Check active mapping
      const activeUser = await redisClient.hget("peerly:active_usernames_map", lowercase);
      if (activeUser) {
        res.status(400).json({ success: false, error: "Username already taken" });
        return;
      }
      
      // Check registered database users
      const dbUser = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } }
      });
      if (dbUser) {
        res.status(400).json({ success: false, error: "Username already taken" });
        return;
      }
    } else {
      // Generate a unique random username
      const adjectives = ["Swift", "Calm", "Brave", "Quiet", "Fast", "Night"];
      const nouns = ["Panda", "Otter", "Eagle", "Falcon", "Turtle", "Fox"];
      let attempts = 0;
      while (attempts < 10) {
        const candidate = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 100)}`;
        const lowercase = candidate.toLowerCase();
        
        const activeUser = await redisClient.hget("peerly:active_usernames_map", lowercase);
        const dbUser = await prisma.user.findFirst({
          where: { username: { equals: candidate, mode: 'insensitive' } }
        });
        
        if (!activeUser && !dbUser) {
          username = candidate;
          break;
        }
        attempts++;
      }
      
      if (!username) {
        username = `User_${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    const guest = await prisma.guestSession.create({
      data: {
        random_username: username,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
    });

    const token = jwt.sign({ id: guest.id, type: 'guest', username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: { id: guest.id, username, type: 'guest' } });
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

app.post("/auth/register", registerLimiter, async (req, res) => {
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
    if (otpRecord.expires_at < new Date()) {
      await prisma.otp.delete({ where: { email } });
      return res.status(400).json({ error: "Code expired" });
    }
    const isValid = await argon2.verify(otpRecord.code, otp);
    if (!isValid) return res.status(400).json({ error: "Invalid code" });

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

app.post("/auth/login", loginLimiter, async (req, res) => {
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
const emailSchema = z.object({ email: z.string().email("Invalid email address") });

app.post("/auth/otp/send", otpLimiter, async (req, res) => {
  try {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { email } = parsed.data;

    // Generate a secure 6 digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Hash the code before storing
    const hashedCode = await argon2.hash(code);

    // Send email first to prevent partial state if email fails
    await EmailService.sendOTPEmail(email, code);

    // Store in DB, update if exists
    await prisma.otp.upsert({
      where: { email },
      update: { code: hashedCode, expires_at, created_at: new Date() },
      create: { email, code: hashedCode, expires_at }
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send OTP email" });
  }
});

app.post("/auth/otp/verify", globalAuthLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and code are required" });

    const otp = await prisma.otp.findUnique({ where: { email } });
    if (!otp) return res.status(400).json({ error: "No pending OTP for this email" });
    
    if (otp.expires_at < new Date()) {
      await prisma.otp.delete({ where: { email } });
      return res.status(400).json({ error: "Code expired" });
    }
    const isValid = await argon2.verify(otp.code, code);
    if (!isValid) return res.status(400).json({ error: "Invalid code" });

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

app.post("/auth/google/verify", globalAuthLimiter, async (req, res) => {
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

app.post("/auth/google/register", globalAuthLimiter, upload.single('avatar'), async (req, res) => {
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

// Rate limit helper
function isRateLimited(socket: any, actionType: string, limitMs: number): boolean {
  const now = Date.now();
  const key = `lastAction_${actionType}`;
  if (socket[key] && now - socket[key] < limitMs) {
    return true;
  }
  socket[key] = now;
  return false;
}

// Escapes special HTML characters to prevent XSS/HTML Injection
function sanitize(str: string): string {
  return str.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#x27;';
      default: return m;
    }
  });
}

// Room destruction helper
async function destroyRoom(roomId: string, reason: string) {
  const state = await redisClient.get(`room:${roomId}:state`);
  if (!state || state === 'destroyed') return;
  
  await redisClient.set(`room:${roomId}:state`, 'destroyed');
  io.to(roomId).emit("session:ended", { reason });
  
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    s.leave(roomId);
    // @ts-ignore
    s.currentRoom = null;
    // @ts-ignore
    s.currentSession = null;
  }
  
  const users = await redisClient.smembers(`room:${roomId}:users`);
  for (const userId of users) {
    await redisClient.set(`user:${userId}:status`, 'online');
  }

  await redisClient.del(`room:${roomId}:state`);
  await redisClient.del(`room:${roomId}:users`);
}

// Find Match algorithm matching tag-priorities with a 10s fallback
async function findMatch(user: { id: string; username: string }, mode: string, tags: string[]): Promise<string | null> {
  const globalQueueKey = `peerly:queue:${mode}:global`;
  const startTime = Date.now();

  const isValidCandidate = async (candidateId: string) => {
    if (candidateId === user.id) return false;
    
    // Atomically set status to 'matched' if it was 'waiting' to avoid race conditions
    const prevStatus = await redisClient.getset(`user:${candidateId}:status`, 'matched');
    if (prevStatus !== 'waiting') {
      if (prevStatus === 'offline') {
        await redisClient.set(`user:${candidateId}:status`, 'offline');
      }
      return false;
    }
    
    const candidateMode = await redisClient.get(`user:${candidateId}:mode`);
    if (candidateMode !== mode) {
      await redisClient.set(`user:${candidateId}:status`, 'waiting');
      return false;
    }
    
    const sockets = await io.in(candidateId).fetchSockets();
    if (sockets.length === 0) {
      await redisClient.set(`user:${candidateId}:status`, 'offline');
      return false;
    }
    return true;
  };

  // 1. Try Tag Matching first (if A has tags)
  if (tags.length > 0) {
    for (const tag of tags) {
      const tagQueueKey = `peerly:queue:${mode}:tag:${tag}`;
      let candidateId = await redisClient.lpop(tagQueueKey);
      while (candidateId) {
        if (await isValidCandidate(candidateId)) {
          const duration = Date.now() - startTime;
          await AnalyticsService.trackMatchmakingTime(duration);
          return candidateId;
        }
        candidateId = await redisClient.lpop(tagQueueKey);
      }
    }
  }

  // 2. Try Global Queue matching
  let candidateId = await redisClient.lpop(globalQueueKey);
  const skippedCandidates: string[] = [];

  while (candidateId) {
    if (await isValidCandidate(candidateId)) {
      const bTagsStr = await redisClient.get(`user:${candidateId}:tags`);
      const bTags = bTagsStr ? JSON.parse(bTagsStr) : [];
      const bJoinTime = Number(await redisClient.get(`user:${candidateId}:join_time`) || 0);
      const isPriorityActive = bTags.length > 0 && (Date.now() - bJoinTime < 10000);
      
      const sharesTags = tags.some((t: string) => bTags.includes(t));
      if (isPriorityActive && !sharesTags) {
        // Skip for now since B is still waiting for their tags
        skippedCandidates.push(candidateId);
      } else {
        // Match found B! Re-enqueue skipped users first
        for (const skipped of skippedCandidates) {
          await redisClient.lpush(globalQueueKey, skipped);
        }
        const duration = Date.now() - startTime;
        await AnalyticsService.trackMatchmakingTime(duration);
        return candidateId;
      }
    }
    candidateId = await redisClient.lpop(globalQueueKey);
  }

  for (const skipped of skippedCandidates) {
    await redisClient.lpush(globalQueueKey, skipped);
  }

  return null;
}

// JWT & Username Unique Registry Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  
  jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
    if (err) return next(new Error("Authentication error"));
    
    console.log(`[Auth Middleware] Authenticating token for ${decoded.username} (${decoded.id}), Type: ${decoded.type}`);
    const lowercase = decoded.username.toLowerCase();
    const existingUserId = await redisClient.hget("peerly:active_usernames_map", lowercase);
    
    if (existingUserId && existingUserId !== decoded.id) {
      console.warn(`[Auth Middleware] Rejecting connection: username taken by ${existingUserId}`);
      return next(new Error("Username already taken"));
    }
    
    // @ts-ignore
    socket.user = decoded;
    next();
  });
});

const onlineUsers = new Map<string, string>(); // userId -> socketId

io.on("connection", async (socket) => {
  // @ts-ignore
  const user = socket.user;
  const usernameKey = user.username.toLowerCase();
  
  console.log(`[Connection] User connected: ${user.username} (${user.id}), Type: ${user.type}, Socket ID: ${socket.id}`);
  
  // Register username in Redis and store original case mapping
  await redisClient.hset("peerly:active_usernames_map", usernameKey, user.id);
  await redisClient.set(`user:${user.id}:username`, user.username);
  await redisClient.set(`user:${user.id}:status`, 'online');
  socket.join(user.id);

  if (user.type === 'user') {
    onlineUsers.set(user.id, socket.id);
    io.emit("presence:update", { userId: user.id, status: "online" });
  }

  // Matchmaking Room Queue Join
  socket.on("match:join", async (data, cb) => {
    try {
      const sessionType: 'random_text' | 'random_video' | 'random_voice' = data?.type || "random_text";
      const tags: string[] = data?.tags || [];
      const mode = sessionType.replace("random_", ""); // text, video, voice
      
      console.log(`[Queue Event] match:join received from ${user.username} (${user.id}). Mode: ${mode}, Tags: ${tags}`);
      
      if (isRateLimited(socket, "join", 1000)) {
        if (cb) cb({ success: false, error: "Matchmaking join rate limited." });
        return;
      }

      // Leave previous rooms/cleanup active sessions
      // @ts-ignore
      if (socket.currentRoom) {
        console.log(`[Queue Event] ${user.username} leaving current active room ${(socket as any).currentRoom} before re-joining`);
        // @ts-ignore
        await destroyRoom(socket.currentRoom, "skipped");
      }

      await redisClient.set(`user:${user.id}:status`, 'waiting');
      await redisClient.set(`user:${user.id}:mode`, mode);
      await redisClient.set(`user:${user.id}:tags`, JSON.stringify(tags));
      await redisClient.set(`user:${user.id}:join_time`, Date.now().toString());
      await redisClient.set(`user:${user.id}:type`, user.type);

      // Attempt to match
      const matchId = await findMatch(user, mode, tags);

      if (matchId) {
        console.log(`[Match Found] Match succeeded! ${user.username} (${user.id}) matched with ${matchId}`);
        await redisClient.set(`user:${user.id}:status`, 'matched');
        await redisClient.set(`user:${matchId}:status`, 'matched');
        
        const matchType = await redisClient.get(`user:${matchId}:type`) || "guest";
        
        const chatSession = await prisma.chatSession.create({
          data: {
            type: sessionType,
            participant_1_type: matchType,
            participant_1_id: matchId,
            participant_2_type: user.type,
            participant_2_id: user.id,
          }
        });
        
        const roomId = `room:${chatSession.id}`;
        console.log(`[Room Created] Room ${roomId} created in matched state`);
        
        await redisClient.set(`room:${roomId}:state`, 'matched');
        await redisClient.sadd(`room:${roomId}:users`, user.id, matchId);
        
        // Connect both socket rooms
        const partnerSockets = await io.in(matchId).fetchSockets();
        console.log(`[Signaling] Connecting sockets for partner ${matchId}. Active sockets: ${partnerSockets.length}`);
        for (const ps of partnerSockets) {
          ps.join(roomId);
          // @ts-ignore
          ps.currentRoom = roomId;
          // @ts-ignore
          ps.currentSession = chatSession.id;
        }
        
        socket.join(roomId);
        // @ts-ignore
        socket.currentRoom = roomId;
        // @ts-ignore
        socket.currentSession = chatSession.id;
        
        const partnerUsername = await redisClient.get(`user:${matchId}:username`) || "Stranger";

        console.log(`[Session Emit] session:start dispatched to ${user.id} and ${matchId}`);
        io.to(matchId).emit("session:start", { roomId, partnerId: user.id, sessionId: chatSession.id, partnerUsername: user.username });
        socket.emit("session:start", { roomId, partnerId: matchId, sessionId: chatSession.id, partnerUsername });

        // 15s WebRTC negotiation timeout
        setTimeout(async () => {
          const state = await redisClient.get(`room:${roomId}:state`);
          if (state === 'matched' || state === 'connected') {
            console.log(`[Watchdog] WebRTC negotiation timeout for room ${roomId}. Rematching...`);
            await destroyRoom(roomId, "timeout");
            await AnalyticsService.trackConnectionSuccess(false);
          }
        }, 15000);

        if (cb) cb({ success: true, status: "matched", roomId });
      } else {
        const globalQueueKey = `peerly:queue:${mode}:global`;
        console.log(`[Queue Push] User ${user.username} (${user.id}) pushed to global queue: ${globalQueueKey}`);
        await redisClient.rpush(globalQueueKey, user.id);
        for (const tag of tags) {
          const tagQueueKey = `peerly:queue:${mode}:tag:${tag}`;
          console.log(`[Queue Push] User ${user.username} pushed to tag queue: ${tagQueueKey}`);
          await redisClient.rpush(tagQueueKey, user.id);
        }
        
        socket.join(user.id);
        if (cb) cb({ success: true, status: "waiting" });
      }
    } catch (error) {
      console.error(`[Queue Error] match:join error:`, error);
      if (cb) cb({ success: false, error: "Failed to join matchmaking" });
    }
  });

  // WebRTC Signaling Events
  socket.on("webrtc:offer", (data) => {
    // @ts-ignore
    if (!socket.currentRoom) {
      console.warn(`[Signaling Offer Blocked] ${user.username} sent webrtc:offer but socket.currentRoom is null/undefined! Room ID: ${data.roomId}`);
      return;
    }
    console.log(`[Signaling Offer] Relaying offer from ${user.username} (${user.id}) to room ${data.roomId}`);
    socket.to(data.roomId).emit("webrtc:offer", { offer: data.offer, senderId: user.id });
  });

  socket.on("webrtc:answer", (data) => {
    // @ts-ignore
    if (!socket.currentRoom) {
      console.warn(`[Signaling Answer Blocked] ${user.username} sent webrtc:answer but socket.currentRoom is null/undefined! Room ID: ${data.roomId}`);
      return;
    }
    console.log(`[Signaling Answer] Relaying answer from ${user.username} (${user.id}) to room ${data.roomId}`);
    socket.to(data.roomId).emit("webrtc:answer", { answer: data.answer, senderId: user.id });
  });

  socket.on("webrtc:ice-candidate", (data) => {
    // @ts-ignore
    if (!socket.currentRoom) return;
    console.log(`[Signaling ICE] Relaying ICE candidate from ${user.username} (${user.id}) to room ${data.roomId}`);
    socket.to(data.roomId).emit("webrtc:ice-candidate", { candidate: data.candidate, senderId: user.id });
  });

  socket.on("webrtc:connected", async (data) => {
    const { roomId } = data;
    console.log(`[WebRTC Connected] Connection state active for room ${roomId}`);
    await redisClient.set(`room:${roomId}:state`, 'active');
    await AnalyticsService.trackConnectionSuccess(true);
  });

  socket.on("session:joined", async (data) => {
    const { roomId, sessionId } = data;
    console.log(`[Signaling Join] session:joined received from ${user.username} (${user.id}) for room ${roomId}`);
    // @ts-ignore
    socket.currentRoom = roomId;
    // @ts-ignore
    socket.currentSession = sessionId;
    socket.join(roomId);
    
    const usersInRoom = await redisClient.smembers(`room:${roomId}:users`);
    if (usersInRoom.length >= 2) {
      await redisClient.set(`room:${roomId}:state`, 'connected');
    }
  });

  // Leave room manually / Cancel search
  socket.on("match:leave", async () => {
    if (isRateLimited(socket, "leave", 500)) return;
    
    // Remove from queues
    await redisClient.set(`user:${user.id}:status`, 'online');
    
    // Clean up queues
    const modes = ["text", "voice", "video"];
    for (const mode of modes) {
      await redisClient.lrem(`peerly:queue:${mode}:global`, 0, user.id);
    }
    
    // @ts-ignore
    const roomId = socket.currentRoom;
    if (roomId) {
      await destroyRoom(roomId, "partner_left");
    }
  });

  // User Skips match
  socket.on("match:skip", async (data, cb) => {
    if (isRateLimited(socket, "skip", 1000)) {
      if (cb) cb({ success: false, error: "Skip rate limited." });
      return;
    }

    // @ts-ignore
    const roomId = socket.currentRoom;
    if (roomId) {
      await destroyRoom(roomId, "partner_skipped");
      await AnalyticsService.trackSkip();
    }
    
    if (cb) cb({ success: true });
  });

  // Text message sending (XSS sanitized, length verified)
  socket.on("message:send", async (data) => {
    const { roomId, message, sessionId } = data;
    if (!message || message.trim() === "") return;
    
    if (isRateLimited(socket, "message", 150)) {
      socket.emit("message:error", { error: "You are sending messages too fast." });
      return;
    }

    const cleanMessage = sanitize(message.trim()).slice(0, 1000); // 1000 chars limit

    try {
      const msg = await prisma.message.create({
        data: {
          chat_session_id: sessionId,
          sender_type: user.type,
          sender_id: user.id,
          content: cleanMessage,
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
    if (roomId) {
      await destroyRoom(roomId, "partner_left");
    }
  });

  // Socket Disconnection
  socket.on("disconnect", async (reason) => {
    console.log(`[Disconnect] User disconnected: ${user.username} (${user.id}). Reason: ${reason}`);
    await AnalyticsService.trackDisconnectReason(reason);

    // Fetch active sockets under user ID to handle multi-tab/reconnects
    const activeSockets = await io.in(user.id).fetchSockets();
    if (activeSockets.length === 0) {
      console.log(`[Cleanup] Releasing username registry and setting offline status for ${user.username} (${user.id})`);
      // Release guest username case-insensitively
      await redisClient.hdel("peerly:active_usernames_map", usernameKey);
      await redisClient.set(`user:${user.id}:status`, 'offline');
      await redisClient.del(`user:${user.id}:username`);
    }

    // Clean up matchmaking lists
    const modes = ["text", "voice", "video"];
    for (const mode of modes) {
      await redisClient.lrem(`peerly:queue:${mode}:global`, 0, user.id);
    }

    // Destroy active room
    // @ts-ignore
    const roomId = socket.currentRoom;
    if (roomId) {
      console.log(`[Disconnect Room Cleanup] Destroying room ${roomId} due to disconnect of ${user.username}`);
      await destroyRoom(roomId, "disconnected");
    }

    if (user.type === 'user') {
      onlineUsers.delete(user.id);
      io.emit("presence:update", { userId: user.id, status: "offline" });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
