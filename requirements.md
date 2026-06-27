# 📋 Project Requirements

Before you can run **Peerly** on your local machine or deploy it to the cloud, ensure your environment meets the following requirements.

---

## 🛠️ Software Prerequisites

You must have the following installed on your machine:

1. **Node.js** (v18.0.0 or higher)
   - *Why?* Required to run both the frontend (Vite) and backend (Express) servers.
   - *Download:* [Node.js Official Website](https://nodejs.org/)

2. **PostgreSQL** (v13 or higher)
   - *Why?* The primary relational database used to store users, friends, chats, and OTPs.
   - *Alternative:* You can use a cloud Postgres provider like [Neon](https://neon.tech/) or [Supabase](https://supabase.com/) instead of installing it locally.

3. **Redis** (v6 or higher)
   - *Why?* Required for the Socket.io adapter (to scale websocket connections) and rate limiting.
   - *Alternative:* You can use a cloud Redis provider like [Upstash](https://upstash.com/).

---

## 🔑 Required Third-Party Services (API Keys)

To fully utilize all features of Peerly, you will need to set up free accounts with the following services to obtain their API credentials:

| Service | Purpose | Required For |
| :--- | :--- | :--- |
| **Google Cloud Console** | Google OAuth Client ID | "Login with Google" feature |
| **Gmail / SMTP Provider**| SMTP Username & App Password | Sending Email OTPs during registration |
| **Cloudinary** (Optional) | Cloudinary Connection URL | Persistent User Avatar uploads on Serverless hosting |

---

## 📦 Package Dependencies (Node Modules)

Since Peerly is a full-stack TypeScript application, it uses `npm` (Node Package Manager) to handle project-level dependencies. 

Unlike Python which uses a `requirements.txt`, Node.js uses a `package.json` file. All required libraries are automatically installed when you run `npm install`. Here are the core libraries used in this project:

### Frontend Libraries:
- **React (v19)**: The core UI library.
- **Vite (v6)**: The lightning-fast frontend build tool.
- **Tailwind CSS (v4)**: For utility-first aesthetic styling.
- **Socket.io-client (v4)**: For real-time chat and WebRTC signaling.
- **Zustand (v5)**: For lightweight global state management.
- **React Router DOM (v7)**: For page navigation.
- **@react-oauth/google**: For "Login with Google" integration.
- **Lucide React**: For beautiful SVG icons.
- **React Hot Toast**: For elegant notification popups.

### Backend Libraries:
- **Express (v4)**: The core Node.js web server framework.
- **Socket.io (v4)**: For handling real-time WebSocket connections.
- **Prisma (v5)**: The next-generation ORM for interacting with PostgreSQL.
- **Argon2**: For state-of-the-art password hashing.
- **JSONWebToken (JWT)**: For secure, stateless authentication.
- **Redis & @socket.io/redis-adapter**: For caching, rate-limiting, and scaling websockets.
- **Nodemailer**: For sending Email OTPs.
- **Multer & Cloudinary**: For handling avatar uploads securely.

To install all of the above, simply run:

```bash
# In the /backend directory
npm install

# In the /frontend directory
npm install
```

> **Ready?** Head back to the [README.md](./README.md) for step-by-step setup instructions!
