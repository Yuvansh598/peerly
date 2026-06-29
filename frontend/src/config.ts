export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  throw new Error("FATAL: VITE_API_URL is required in production.");
}

const TURN_URL_1 = import.meta.env.VITE_TURN_URL_1;
const TURN_URL_2 = import.meta.env.VITE_TURN_URL_2;
const TURN_URL_3 = import.meta.env.VITE_TURN_URL_3;
const TURN_URL_4 = import.meta.env.VITE_TURN_URL_4;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME;
const TURN_PASSWORD = import.meta.env.VITE_TURN_PASSWORD;

if (import.meta.env.PROD && (!TURN_URL_1 || !TURN_USERNAME || !TURN_PASSWORD)) {
  console.warn("WARNING: TURN server credentials (VITE_TURN_URL_1, VITE_TURN_USERNAME, VITE_TURN_PASSWORD) are missing. WebRTC calls may fail behind restrictive NATs.");
}

export const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: "stun:stun.relay.metered.ca:80",
  }
];

if (TURN_URL_1 && TURN_USERNAME && TURN_PASSWORD) ICE_SERVERS.push({ urls: TURN_URL_1, username: TURN_USERNAME, credential: TURN_PASSWORD });
if (TURN_URL_2 && TURN_USERNAME && TURN_PASSWORD) ICE_SERVERS.push({ urls: TURN_URL_2, username: TURN_USERNAME, credential: TURN_PASSWORD });
if (TURN_URL_3 && TURN_USERNAME && TURN_PASSWORD) ICE_SERVERS.push({ urls: TURN_URL_3, username: TURN_USERNAME, credential: TURN_PASSWORD });
if (TURN_URL_4 && TURN_USERNAME && TURN_PASSWORD) ICE_SERVERS.push({ urls: TURN_URL_4, username: TURN_USERNAME, credential: TURN_PASSWORD });
