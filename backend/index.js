"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const ioredis_1 = require("ioredis");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const argon2_1 = __importDefault(require("argon2"));
const zod_1 = require("zod");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = __importDefault(require("rate-limit-redis"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const prisma = new client_1.PrismaClient();
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const pubClient = new ioredis_1.Redis(redisUrl);
const subClient = pubClient.duplicate();
const redisClient = pubClient.duplicate();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-for-jwt";
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// --- RATE LIMITERS ---
const limiterOptions = {
    store: new rate_limit_redis_1.default({
        // @ts-expect-error - Known issue with rate-limit-redis type definitions
        sendCommand: (...args) => redisClient.call(...args),
    }),
    standardHeaders: true,
    legacyHeaders: false,
};
// Max 50 per hour for guests/auth endpoints
const authLimiter = (0, express_rate_limit_1.default)({
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
        const token = jsonwebtoken_1.default.sign({ id: guest.id, type: 'guest', username: randomName }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { id: guest.id, username: randomName, type: 'guest' } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Failed to create guest" });
    }
});
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    username: zod_1.z.string().min(3),
    date_of_birth: zod_1.z.string()
});
app.post("/auth/register", async (req, res) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error });
        const { email, password, username, date_of_birth } = parsed.data;
        const existing = await prisma.user.findFirst({
            where: { OR: [{ email }, { username }] }
        });
        if (existing)
            return res.status(400).json({ error: "Email or username taken" });
        const password_hash = await argon2_1.default.hash(password);
        const user = await prisma.user.create({
            data: {
                auth_provider: "email",
                email,
                username,
                password_hash,
                date_of_birth: new Date(date_of_birth)
            }
        });
        const token = jsonwebtoken_1.default.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, type: 'user' } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});
app.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password_hash)
            return res.status(400).json({ error: "Invalid credentials" });
        const isValid = await argon2_1.default.verify(user.password_hash, password);
        if (!isValid)
            return res.status(400).json({ error: "Invalid credentials" });
        const token = jsonwebtoken_1.default.sign({ id: user.id, type: 'user', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, type: 'user' } });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});
// --- SOCKET.IO ---
// JWT Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token)
        return next(new Error("Authentication error"));
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
        if (err)
            return next(new Error("Authentication error"));
        // @ts-ignore
        socket.user = decoded;
        next();
    });
});
const WAITING_QUEUE_KEY = "queue:text:global";
io.on("connection", (socket) => {
    // @ts-ignore
    const user = socket.user;
    console.log(`User connected: ${user.username} (${user.id})`);
    // Matchmaking
    socket.on("match:join", async (cb) => {
        try {
            const waitingUserId = await redisClient.lpop(WAITING_QUEUE_KEY);
            if (waitingUserId && waitingUserId !== user.id) {
                // Match found!
                const chatSession = await prisma.chatSession.create({
                    data: {
                        type: "random_text",
                        participant_1_type: "guest", // Assuming guest for now or dynamically resolving
                        participant_1_id: waitingUserId,
                        participant_2_type: "guest",
                        participant_2_id: user.id,
                    }
                });
                const roomId = `room:${chatSession.id}`;
                socket.join(roomId);
                io.to(waitingUserId).emit("session:start", { roomId, partnerId: user.id, sessionId: chatSession.id });
                socket.emit("session:start", { roomId, partnerId: waitingUserId, sessionId: chatSession.id });
                if (cb)
                    cb({ success: true, status: "matched", roomId });
            }
            else {
                await redisClient.rpush(WAITING_QUEUE_KEY, user.id);
                socket.join(user.id);
                if (cb)
                    cb({ success: true, status: "waiting" });
            }
        }
        catch (error) {
            console.error(error);
            if (cb)
                cb({ success: false, error: "Failed to join queue" });
        }
    });
    socket.on("match:leave", async () => {
        await redisClient.lrem(WAITING_QUEUE_KEY, 0, user.id);
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
        }
        catch (e) {
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
        try {
            await prisma.chatSession.update({
                where: { id: sessionId },
                data: { ended_at: new Date(), end_reason: "user_left" }
            });
            io.to(roomId).emit("session:ended");
        }
        catch (e) {
            console.error(e);
        }
    });
    socket.on("disconnect", async () => {
        await redisClient.lrem(WAITING_QUEUE_KEY, 0, user.id);
        console.log(`User disconnected: ${user.username}`);
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
