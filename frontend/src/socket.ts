import { io } from "socket.io-client";
import { API_URL } from "./config";

// In production, this should point to your actual backend URL.
export const socket = io(API_URL, {
  autoConnect: false
});

export const connectSocket = (token: string) => {
  if (socket.connected) socket.disconnect();
  socket.auth = { token };
  socket.connect();
};
