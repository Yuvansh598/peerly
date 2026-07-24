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
import { logger } from "./logger";

import { v2 as cloudinary } from "cloudinary";
const { CloudinaryStorage } = require("multer-storage-cloudinary");

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  logger.error("FATAL: FRONTEND_URL environment variable is required in production.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);
const prisma = new PrismaClient();

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const pubClient = new Redis(redisUrl);
pubClient.on("error", (err) => logger.error("Redis pubClient error", { error: err.message }));
const subClient = pubClient.duplicate();
subClient.on("error", (err) => logger.error("Redis subClient error", { error: err.message }));
const redisClient = pubClient.duplicate();
redisClient.on("error", (err) => logger.error("Redis redisClient error", { error: err.message }));
AnalyticsService.init(redisClient);

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-for-jwt";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const serverStartTime = Date.now();

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

app.get("/stats", async (req, res) => {
  try {
    const stats = await getLiveStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Internal Diagnostics Endpoint (Admin Monitoring - Section 8)
app.get("/admin/diagnostics", async (req, res) => {
  try {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
    const redisPing = await redisClient.ping().catch(() => "FAILED");
    const socketCount = io.engine ? io.engine.clientsCount : 0;
    const roomKeys = await redisClient.keys("room:*:state");
    
    const textQueueCount = await redisClient.zcard("peerly:queue:text:zset");
    const voiceQueueCount = await redisClient.zcard("peerly:queue:voice:zset");
    const videoQueueCount = await redisClient.zcard("peerly:queue:video:zset");

    const analytics = await AnalyticsService.getStats();

    res.json({
      status: "healthy",
      serverUptimeSeconds: uptimeSeconds,
      process: {
        nodeVersion: process.version,
        pid: process.pid,
        memoryUsage: {
          rssMB: Math.round(memory.rss / (1024 * 1024)),
          heapTotalMB: Math.round(memory.heapTotal / (1024 * 1024)),
          heapUsedMB: Math.round(memory.heapUsed / (1024 * 1024)),
          externalMB: Math.round(memory.external / (1024 * 1024))
        },
        cpuUsageMicroseconds: cpu
      },
      services: {
        redisStatus: redisPing === "PONG" ? "connected" : "error",
        socketCount,
        activeRoomsCount: roomKeys.length,
        queues: {
          text: textQueueCount,
          voice: voiceQueueCount,
          video: videoQueueCount
        }
      },
      analytics: {
        successfulConnections: analytics?.successfulConnections || 0,
        failedConnections: analytics?.failedConnections || 0,
        connectionSuccessRate: analytics?.connectionSuccessRate || 100,
        avgMatchTimeMs: Math.round(analytics?.averageMatchmakingTimeMs || 0),
        avgSessionDurationSec: Math.round((analytics?.averageSessionDurationMs || 0) / 1000),
        avgICECompletionTimeMs: Math.round(analytics?.averageICECompletionTimeMs || 0),
        messagesToday: analytics?.messagesToday || 0,
        dailyPeakUsers: analytics?.dailyPeakUsers || 0
      }
    });
  } catch (e: any) {
    logger.error("Error in admin diagnostics endpoint", { error: e.message });
    res.status(500).json({ error: "Failed to generate diagnostics" });
  }
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
      
      const activeUser = await redisClient.hget("peerly:active_usernames_map", lowercase);
      if (activeUser) {
        res.status(400).json({ success: false, error: "Username already taken" });
        return;
      }
      
      const dbUser = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } }
      });
      if (dbUser) {
        res.status(400).json({ success: false, error: "Username already taken" });
        return;
      }
    } else {
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
  } catch (error: any) {
    logger.error("Failed to create guest session", { error: error.message });
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
  } catch (error: any) {
    logger.error("Registration error", { error: error.message });
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
  } catch (error: any) {
    logger.error("Login error", { error: error.message });
    res.status(500).json({ error: "Server error" });
  }
});

const emailSchema = z.object({ email: z.string().email("Invalid email address") });

app.post("/auth/otp/send", otpLimiter, async (req, res) => {
  try {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { email } = parsed.data;

    const code = crypto.randomInt(100000, 999999).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    const hashedCode = await argon2.hash(code);
    await EmailService.sendOTPEmail(email, code);

    await prisma.otp.upsert({
      where: { email },
      update: { code: hashedCode, expires_at, created_at: new Date() },
      create: { email, code: hashedCode, expires_at }
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error("OTP Send error", { error: error.message });
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

    await prisma.otp.delete({ where: { email } });

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
  } catch (error: any) {
    logger.error("OTP Verify error", { error: error.message });
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
      const token = jwt.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, isNewUser: false, token, user: { id: user.id, username: user.username, type: 'user' } });
    } else {
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
  } catch (error: any) {
    logger.error("Google Auth Error", { error: error.message });
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
  } catch (error: any) {
    logger.error("Google Register Error", { error: error.message });
    res.status(500).json({ error: "Registration failed" });
  }
});

// --- USER & FRIEND ENDPOINTS ---

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
    
    const activeFriends = [
      ...friendshipsA.map(f => ({ ...f, friend: f.user_b })),
      ...friendshipsB.map(f => ({ ...f, friend: f.user_a }))
    ];

    const pendingRequests = await prisma.friendRequest.findMany({
      where: { receiver_id: req.user.id, status: 'pending' },
      include: { sender: { select: { id: true, username: true, display_name: true, avatar_url: true } } }
    });
    
    res.json({ user, friendships: activeFriends, pendingRequests });
  } catch (e: any) {
    logger.error("Fetch user profile error", { error: e.message });
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
  } catch (e: any) {
    logger.error("Update profile error", { error: e.message });
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.delete("/users/me", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    await prisma.friendship.deleteMany({
      where: { OR: [{ user_a_id: userId }, { user_b_id: userId }] }
    });
    await prisma.friendRequest.deleteMany({
      where: { OR: [{ sender_id: userId }, { receiver_id: userId }] }
    });
    await prisma.message.deleteMany({
      where: { sender_id: userId }
    });
    await prisma.user.delete({
      where: { id: userId }
    });
    res.json({ success: true });
  } catch (e: any) {
    logger.error("Delete user error", { error: e.message, userId: req.user?.id });
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
    
    io.to(targetUserId).emit('presence:update');
    res.json({ success: true, request });
  } catch (e: any) {
    logger.error("Friend request error", { error: e.message });
    res.status(500).json({ error: "Failed to send friend request" });
  }
});

app.post("/friends/respond", requireAuth, async (req: any, res: any) => {
  try {
    const { requestId, action } = req.body;
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    
    if (!request || request.receiver_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (action === 'accept' || action === 'accepted') {
      await prisma.$transaction([
        prisma.friendRequest.update({
          where: { id: requestId },
          data: { status: 'accepted', responded_at: new Date() }
        }),
        prisma.friendship.create({
          data: { user_a_id: request.sender_id, user_b_id: request.receiver_id }
        })
      ]);
      io.to(request.sender_id).emit('presence:update');
    } else {
      await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'declined', responded_at: new Date() }
      });
      io.to(request.sender_id).emit('presence:update');
    }
    res.json({ success: true });
  } catch (e: any) {
    logger.error("Friend request respond error", { error: e.message });
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
  } catch (e: any) {
    logger.error("Friend chat load error", { error: e.message });
    res.status(500).json({ error: "Failed to load chat history" });
  }
});

// --- SOCKET.IO & MATCHMAKING SYSTEM ---

const onlineUsers = new Map<string, string>();

function isRateLimited(socket: any, actionType: string, limitMs: number): boolean {
  const now = Date.now();
  const key = `lastAction_${actionType}`;
  if (socket[key] && now - socket[key] < limitMs) {
    return true;
  }
  socket[key] = now;
  return false;
}

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

// Live Dashboard Stats aggregator
async function getLiveStats() {
  const now = Date.now();
  const uptime = Math.floor((now - serverStartTime) / 1000);
  const onlineCount = onlineUsers.size;

  const textQueueCount = await redisClient.zcard("peerly:queue:text:zset");
  const voiceQueueCount = await redisClient.zcard("peerly:queue:voice:zset");
  const videoQueueCount = await redisClient.zcard("peerly:queue:video:zset");
  const searchingUsers = textQueueCount + voiceQueueCount + videoQueueCount;

  const roomKeys = await redisClient.keys("room:*:state");
  let totalActiveRooms = 0;
  let activeTextChats = 0;
  let activeVoiceChats = 0;
  let activeVideoChats = 0;

  for (const key of roomKeys) {
    const state = await redisClient.get(key);
    if (state === 'matched' || state === 'connected' || state === 'active') {
      totalActiveRooms++;
      const roomId = key.split(":")[1];
      const mode = await redisClient.get(`room:${roomId}:mode`);
      if (mode === 'random_text') activeTextChats++;
      else if (mode === 'random_voice') activeVoiceChats++;
      else if (mode === 'random_video') activeVideoChats++;
    }
  }

  const analytics = await AnalyticsService.getStats();
  const matchesToday = Number(await redisClient.get("peerly:analytics:matches_today") || 0);

  return {
    onlineUsers: onlineCount,
    searchingUsers,
    usersInTextQueue: textQueueCount,
    usersInVoiceQueue: voiceQueueCount,
    usersInVideoQueue: videoQueueCount,
    totalActiveRooms,
    activeTextChats,
    activeVoiceChats,
    activeVideoChats,
    matchesToday,
    messagesToday: analytics?.messagesToday || 0,
    dailyPeakUsers: analytics?.dailyPeakUsers || onlineCount,
    successfulConnections: analytics?.successfulConnections || 0,
    failedConnections: analytics?.failedConnections || 0,
    averageMatchTime: Math.round(analytics?.averageMatchmakingTimeMs || 0),
    averageSessionTime: Math.round(analytics?.averageSessionDurationMs ? analytics.averageSessionDurationMs / 1000 : 0),
    averageICECompletionTime: Math.round(analytics?.averageICECompletionTimeMs || 0),
    serverUptime: uptime
  };
}

function broadcastStats() {
  getLiveStats().then(stats => {
    if (stats) {
      io.emit("dashboard:stats", stats);
    }
  }).catch(err => logger.error("Error broadcasting stats", { error: err.message }));
}

// Queue cleanup helper
async function removeFromAllQueues(userId: string) {
  const modes = ["text", "voice", "video"];
  for (const mode of modes) {
    await redisClient.zrem(`peerly:queue:${mode}:zset`, userId);
    await redisClient.lrem(`peerly:queue:${mode}:global`, 0, userId);
  }
  
  const tagsStr = await redisClient.get(`user:${userId}:tags`);
  if (tagsStr) {
    try {
      const tags: string[] = JSON.parse(tagsStr);
      const mode = await redisClient.get(`user:${userId}:mode`);
      if (mode) {
        for (const tag of tags) {
          await redisClient.lrem(`peerly:queue:${mode}:tag:${tag}`, 0, userId);
        }
      }
    } catch (e) {}
  }
  await redisClient.del(`user:${userId}:mode`, `user:${userId}:tags`, `user:${userId}:join_time`);
}

// Room destruction helper
async function destroyRoom(roomId: string, reason: string) {
  const state = await redisClient.get(`room:${roomId}:state`);
  if (!state || state === 'destroyed') return;
  
  const startTimeStr = await redisClient.get(`room:${roomId}:start_time`);
  if (startTimeStr) {
    const duration = Date.now() - Number(startTimeStr);
    await AnalyticsService.trackSessionDuration(duration);
  }
  
  logger.info(`Destroying room ${roomId}`, { roomId, reason });

  await redisClient.set(`room:${roomId}:state`, 'destroyed');
  io.to(roomId).emit("session:ended", { reason });
  
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    s.leave(roomId);
    s.data.currentRoom = null;
    s.data.currentSession = null;
  }
  
  const users = await redisClient.smembers(`room:${roomId}:users`);
  for (const userId of users) {
    await redisClient.set(`user:${userId}:status`, 'online');
  }

  await redisClient.del(
    `room:${roomId}:state`,
    `room:${roomId}:users`,
    `room:${roomId}:mode`,
    `room:${roomId}:start_time`,
    `room:${roomId}:webrtc_start`
  );

  broadcastStats();
}

// Atomic claim of a candidate
async function claimCandidate(candidateId: string, expectedMode: string): Promise<boolean> {
  const sockets = await io.in(candidateId).fetchSockets();
  if (sockets.length === 0) {
    await redisClient.set(`user:${candidateId}:status`, 'offline');
    return false;
  }

  const candidateMode = await redisClient.get(`user:${candidateId}:mode`);
  if (candidateMode !== expectedMode) {
    return false;
  }

  const luaScript = `
    if redis.call("get", KEYS[1]) == "waiting" then
      redis.call("set", KEYS[1], "matched")
      return 1
    else
      return 0
    end
  `;

  const claimed = await redisClient.eval(luaScript, 1, `user:${candidateId}:status`);
  return claimed === 1;
}

// Sorted Set FIFO Matchmaking algorithm
async function findMatch(user: { id: string; username: string }, mode: string, tags: string[]): Promise<string | null> {
  const zsetKey = `peerly:queue:${mode}:zset`;
  const startTime = Date.now();

  // 1. Tag matching
  if (tags.length > 0) {
    for (const tag of tags) {
      const tagQueueKey = `peerly:queue:${mode}:tag:${tag}`;
      let candidateId = await redisClient.lpop(tagQueueKey);
      while (candidateId) {
        if (candidateId !== user.id) {
          const claimed = await claimCandidate(candidateId, mode);
          if (claimed) {
            await removeFromAllQueues(candidateId);
            await AnalyticsService.trackMatchmakingTime(Date.now() - startTime);
            return candidateId;
          }
        }
        candidateId = await redisClient.lpop(tagQueueKey);
      }
    }
  }

  // 2. Sorted Set FIFO Queue lookup
  const candidates = await redisClient.zrange(zsetKey, 0, 20);
  for (const candidateId of candidates) {
    if (candidateId === user.id) continue;

    const claimed = await claimCandidate(candidateId, mode);
    if (claimed) {
      await removeFromAllQueues(candidateId);
      await AnalyticsService.trackMatchmakingTime(Date.now() - startTime);
      return candidateId;
    } else {
      await redisClient.zrem(zsetKey, candidateId);
    }
  }

  return null;
}

// JWT & Username Auth Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  
  jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
    if (err) return next(new Error("Authentication error"));
    
    const lowercase = decoded.username.toLowerCase();
    const existingUserId = await redisClient.hget("peerly:active_usernames_map", lowercase);
    
    if (existingUserId && existingUserId !== decoded.id) {
      logger.warn("Rejecting socket connection: username taken", { username: decoded.username, userId: decoded.id });
      return next(new Error("Username already taken"));
    }
    
    // @ts-ignore
    socket.user = decoded;
    next();
  });
});

io.on("connection", async (socket) => {
  // @ts-ignore
  const user = socket.user;
  const usernameKey = user.username.toLowerCase();
  
  logger.info("User connected", { socketId: socket.id, username: user.username, userId: user.id });
  
  await redisClient.hset("peerly:active_usernames_map", usernameKey, user.id);
  await redisClient.set(`user:${user.id}:username`, user.username);
  await redisClient.set(`user:${user.id}:status`, 'online');
  socket.join(user.id);

  if (user.type === 'user') {
    onlineUsers.set(user.id, socket.id);
    io.emit("presence:update", { userId: user.id, status: "online" });
    await AnalyticsService.trackPeakUsers(onlineUsers.size);
  }

  broadcastStats();

  socket.on("dashboard:request-stats", async () => {
    const stats = await getLiveStats();
    socket.emit("dashboard:stats", stats);
  });

  // Matchmaking Queue Join
  socket.on("match:join", async (data, cb) => {
    try {
      const sessionType: 'random_text' | 'random_video' | 'random_voice' = data?.type || "random_text";
      const tags: string[] = data?.tags || [];
      const mode = sessionType.replace("random_", "");
      
      logger.info("match:join request", { socketId: socket.id, userId: user.id, mode, tags });
      
      if (isRateLimited(socket, "join", 500)) {
        if (cb) cb({ success: false, error: "Matchmaking join rate limited." });
        return;
      }

      if (socket.data.currentRoom) {
        await destroyRoom(socket.data.currentRoom, "skipped");
      }
      await removeFromAllQueues(user.id);

      await redisClient.set(`user:${user.id}:status`, 'waiting');
      await redisClient.set(`user:${user.id}:mode`, mode);
      await redisClient.set(`user:${user.id}:tags`, JSON.stringify(tags));
      await redisClient.set(`user:${user.id}:join_time`, Date.now().toString());
      await redisClient.set(`user:${user.id}:type`, user.type);

      const matchId = await findMatch(user, mode, tags);

      if (matchId) {
        logger.info("Match created", { userId: user.id, partnerId: matchId, mode });
        await removeFromAllQueues(user.id);

        await redisClient.set(`user:${user.id}:status`, 'matched');
        await redisClient.set(`user:${matchId}:status`, 'matched');
        await redisClient.incr("peerly:analytics:matches_today");

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
        
        await redisClient.set(`room:${roomId}:state`, 'matched');
        await redisClient.set(`room:${roomId}:mode`, sessionType);
        await redisClient.set(`room:${roomId}:start_time`, Date.now().toString());
        await redisClient.set(`room:${roomId}:webrtc_start`, Date.now().toString());
        await redisClient.sadd(`room:${roomId}:users`, user.id, matchId);
        
        const partnerSockets = await io.in(matchId).fetchSockets();
        for (const ps of partnerSockets) {
          ps.join(roomId);
          ps.data.currentRoom = roomId;
          ps.data.currentSession = chatSession.id;
        }
        
        socket.join(roomId);
        socket.data.currentRoom = roomId;
        socket.data.currentSession = chatSession.id;
        
        const partnerUsername = await redisClient.get(`user:${matchId}:username`) || "Stranger";
        const userIsCaller = user.id < matchId;

        io.to(matchId).emit("session:start", {
          roomId,
          partnerId: user.id,
          sessionId: chatSession.id,
          partnerUsername: user.username,
          isCaller: !userIsCaller
        });

        socket.emit("session:start", {
          roomId,
          partnerId: matchId,
          sessionId: chatSession.id,
          partnerUsername,
          isCaller: userIsCaller
        });

        setTimeout(async () => {
          const state = await redisClient.get(`room:${roomId}:state`);
          if (state === 'matched') {
            logger.warn("WebRTC negotiation watchdog timed out", { roomId });
            await destroyRoom(roomId, "timeout");
            await AnalyticsService.trackConnectionSuccess(false);
          }
        }, 15000);

        broadcastStats();
        if (cb) cb({ success: true, status: "matched", roomId });
      } else {
        const zsetKey = `peerly:queue:${mode}:zset`;
        await redisClient.zadd(zsetKey, Date.now(), user.id);
        
        for (const tag of tags) {
          const tagQueueKey = `peerly:queue:${mode}:tag:${tag}`;
          await redisClient.rpush(tagQueueKey, user.id);
        }
        
        broadcastStats();
        if (cb) cb({ success: true, status: "waiting" });
      }
    } catch (error: any) {
      logger.error("match:join error", { error: error.message, userId: user.id });
      if (cb) cb({ success: false, error: "Failed to join matchmaking" });
    }
  });

  // WebRTC Signaling Events with payload validation & room ownership verification
  socket.on("webrtc:offer", (data) => {
    const roomId = data?.roomId || socket.data.currentRoom;
    if (!roomId || !socket.rooms.has(roomId) || !data?.offer) {
      logger.warn("webrtc:offer blocked - invalid payload or room ownership", { socketId: socket.id, roomId });
      return;
    }
    socket.to(roomId).emit("webrtc:offer", { offer: data.offer, senderId: user.id });
  });

  socket.on("webrtc:answer", (data) => {
    const roomId = data?.roomId || socket.data.currentRoom;
    if (!roomId || !socket.rooms.has(roomId) || !data?.answer) {
      logger.warn("webrtc:answer blocked - invalid payload or room ownership", { socketId: socket.id, roomId });
      return;
    }
    socket.to(roomId).emit("webrtc:answer", { answer: data.answer, senderId: user.id });
  });

  socket.on("webrtc:ice-candidate", (data) => {
    const roomId = data?.roomId || socket.data.currentRoom;
    if (!roomId || !socket.rooms.has(roomId) || !data?.candidate) return;
    socket.to(roomId).emit("webrtc:ice-candidate", { candidate: data.candidate, senderId: user.id });
  });

  socket.on("webrtc:connected", async (data) => {
    const roomId = data?.roomId || socket.data.currentRoom;
    if (!roomId || !socket.rooms.has(roomId)) return;

    const webrtcStartStr = await redisClient.get(`room:${roomId}:webrtc_start`);
    if (webrtcStartStr) {
      const iceDuration = Date.now() - Number(webrtcStartStr);
      await AnalyticsService.trackICECompletionTime(iceDuration);
    }

    logger.info("WebRTC connected", { roomId, userId: user.id });
    await redisClient.set(`room:${roomId}:state`, 'active');
    await AnalyticsService.trackConnectionSuccess(true);
    broadcastStats();
  });

  socket.on("match:leave", async () => {
    if (isRateLimited(socket, "leave", 300)) return;
    
    await removeFromAllQueues(user.id);
    await redisClient.set(`user:${user.id}:status`, 'online');
    
    const roomId = socket.data.currentRoom;
    if (roomId) {
      await destroyRoom(roomId, "partner_left");
    }
    broadcastStats();
  });

  socket.on("match:skip", async (data, cb) => {
    if (isRateLimited(socket, "skip", 500)) {
      if (cb) cb({ success: false, error: "Skip rate limited." });
      return;
    }

    const roomId = socket.data.currentRoom;
    if (roomId) {
      await destroyRoom(roomId, "partner_skipped");
      await AnalyticsService.trackSkip();
    }
    
    if (cb) cb({ success: true });
  });

  socket.on("message:send", async (data) => {
    const { message, sessionId } = data;
    const roomId = data?.roomId || socket.data.currentRoom;
    if (!message || !message.trim() || !roomId || !socket.rooms.has(roomId)) return;
    
    if (isRateLimited(socket, "message", 150)) {
      socket.emit("message:error", { error: "You are sending messages too fast." });
      return;
    }

    const cleanMessage = sanitize(message.trim()).slice(0, 1000);

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
      await AnalyticsService.trackMessageSent();
      io.to(roomId).emit("message:receive", msg);
      broadcastStats();
    } catch (e: any) {
      logger.error("message:send error", { error: e.message, roomId });
    }
  });

  socket.on("typing:start", (data) => {
    const roomId = data?.roomId || socket.data.currentRoom;
    if (roomId && socket.rooms.has(roomId)) socket.to(roomId).emit("typing:start", { senderId: user.id });
  });

  socket.on("typing:stop", (data) => {
    const roomId = data?.roomId || socket.data.currentRoom;
    if (roomId && socket.rooms.has(roomId)) socket.to(roomId).emit("typing:stop", { senderId: user.id });
  });

  socket.on("session:end", async (data) => {
    const roomId = data?.roomId || socket.data.currentRoom;
    if (roomId && socket.rooms.has(roomId)) {
      await destroyRoom(roomId, "partner_left");
    }
  });

  socket.on("disconnect", async (reason) => {
    logger.info("User disconnected", { socketId: socket.id, username: user.username, userId: user.id, reason });
    await AnalyticsService.trackDisconnectReason(reason);

    await removeFromAllQueues(user.id);

    const activeSockets = await io.in(user.id).fetchSockets();
    if (activeSockets.length === 0) {
      await redisClient.hdel("peerly:active_usernames_map", usernameKey);
      await redisClient.set(`user:${user.id}:status`, 'offline');
      await redisClient.del(`user:${user.id}:username`);
    }

    const roomId = socket.data.currentRoom;
    if (roomId) {
      await destroyRoom(roomId, "disconnected");
    }

    if (user.type === 'user') {
      onlineUsers.delete(user.id);
      io.emit("presence:update", { userId: user.id, status: "offline" });
    }

    broadcastStats();
  });
});

httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
