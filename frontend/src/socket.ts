import { io } from "socket.io-client";
import { SOCKET_URL } from "./config";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});

const DEBUG = import.meta.env.DEV || import.meta.env.VITE_DEBUG_WEBRTC === "true";

socket.on("connect", () => {
  if (DEBUG) console.log(`[Socket] Connected. ID: ${socket.id}`);
});

socket.on("disconnect", (reason) => {
  if (DEBUG) console.log(`[Socket] Disconnected. Reason: ${reason}`);
});

socket.on("connect_error", (err) => {
  if (DEBUG) console.error(`[Socket] Connection Error:`, err.message);
});

socket.io.on("reconnect_attempt", (attempt) => {
  if (DEBUG) console.log(`[Socket] Reconnect attempt: ${attempt}`);
});

socket.io.on("reconnect", () => {
  if (DEBUG) console.log(`[Socket] Reconnected successfully`);
});

export const connectSocket = (token: string) => {
  if (socket.connected) socket.disconnect();
  socket.auth = { token };
  socket.connect();
};

export const disconnectSocket = () => {
  socket.disconnect();
};
