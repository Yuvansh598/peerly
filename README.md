<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/users-round.svg" width="120" alt="Peerly Logo" />
  <h1>✨ Peerly ✨</h1>
  <p><strong>A modern, real-time anonymous chatting & video calling platform</strong></p>

  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.io" />
    <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  </p>
</div>

---

## 🚀 About Peerly

Peerly is a beautifully designed, real-time communication platform that allows users to instantly connect with strangers or friends across the globe. Built with a robust WebRTC and Socket.io foundation, it supports high-quality text, voice, and video chats.

Whether you want to browse anonymously as a guest, or create an account to save friends, customize your profile, and send offline messages—Peerly provides a premium, responsive experience.

## ✨ Features

- 🎭 **Anonymous Matchmaking**: Instantly match with random strangers based on shared interests & tags.
- 📹 **Video, Voice & Text Chat**: WebRTC-powered peer-to-peer video and audio, alongside lightning-fast socket text messaging.
- 🔒 **Secure Authentication**: Google OAuth integration and custom passwordless Email OTP verification.
- 👥 **Friend System**: Add friends, manage friend requests, and seamlessly chat with offline/online friends.
- 🎨 **Modern UI/UX**: A dark-mode optimized, responsive interface built with Tailwind CSS, featuring glassmorphism and beautiful micro-interactions.
- ☁️ **Cloud Storage**: Integrated Cloudinary support for seamless user avatar management.
- ⚡ **Optimized Performance**: Redis-backed queues and rate limiters ensure the backend stays fast and secure.

---

## 💻 Tech Stack

### Frontend
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Real-Time**: Socket.io-client, WebRTC
- **Icons**: Lucide React

### Backend
- **Server**: Node.js + Express
- **Real-Time**: Socket.io + Redis Adapter
- **Database**: PostgreSQL with Prisma ORM
- **Cache & Queue**: Redis
- **Authentication**: JWT, Argon2, Google Auth Library, OTP via Nodemailer
- **Storage**: Cloudinary / Multer

---

## 🛠️ Getting Started

> Check out the [`requirements.md`](./requirements.md) file for a detailed list of system prerequisites!

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/peerly.git
cd peerly
```

### 2. Install all Requirements (Dependencies)
Because this is a Node.js project, `package.json` acts exactly like a `requirements.txt` file. We have set up a single command to automatically install all dependencies for both the frontend and backend:

```bash
npm run install-all
```

### 3. Setup the Backend
```bash
cd backend
```
- Rename `.env.example` to `.env` and fill in your PostgreSQL, Redis, and SMTP credentials.
- Push the database schema:
```bash
npx prisma db push
```
- Start the backend server:
```bash
npm run dev
```

### 4. Setup the Frontend
Open a new terminal window:
```bash
cd frontend
```
- Rename `.env.example` to `.env`. Ensure `VITE_API_URL` points to your backend (default is `http://localhost:3001`).
- Start the frontend development server:
```bash
npm run dev
```

---
<div align="center">
  <i>Built with ❤️ for real-time connections.</i>
</div>
