import { ICE_SERVERS } from '../config';

export type WebRTCStats = {
  socketConnected: boolean;
  roomId: string | null;
  role: 'Caller' | 'Callee' | null;
  signalingState: string;
  iceState: string;
  connectionState: string;
  candidates: {
    total: number;
    relay: number;
    srflx: number;
    host: number;
  };
  selectedCandidatePair?: string | null;
  localMedia: boolean;
  remoteMedia: boolean;
};

export const WebRTCDebugPanel = ({ stats }: { stats: WebRTCStats }) => {
  const isDebug = import.meta.env.DEV || import.meta.env.VITE_DEBUG_WEBRTC === "true";

  if (!isDebug) return null;

  return (
    <div className="absolute top-4 left-4 z-50 p-4 rounded-lg bg-black/80 text-green-400 font-mono text-xs shadow-lg border border-green-900 pointer-events-none min-w-[220px]">
      <div className="font-bold border-b border-green-800 pb-2 mb-2 text-green-300">WebRTC Diagnostics</div>
      
      <div className="mb-2">
        <div className="text-gray-400">Socket:</div>
        <div>{stats.socketConnected ? '✓ Connected' : '✗ Disconnected'}</div>
      </div>
      
      <div className="mb-2">
        <div className="text-gray-400">Room:</div>
        <div className="truncate max-w-[180px]">{stats.roomId || 'None'}</div>
      </div>
      
      <div className="mb-2">
        <div className="text-gray-400">Role:</div>
        <div>{stats.role || 'Waiting'}</div>
      </div>
      
      <div className="mb-2">
        <div className="text-gray-400">Signaling:</div>
        <div>{stats.signalingState || 'None'}</div>
      </div>
      
      <div className="mb-2">
        <div className="text-gray-400">ICE Candidates:</div>
        <div>Total: {stats.candidates.total}</div>
        <div className="pl-2">relay: {stats.candidates.relay}</div>
        <div className="pl-2">srflx: {stats.candidates.srflx}</div>
        <div className="pl-2">host: {stats.candidates.host}</div>
      </div>
      
      {stats.selectedCandidatePair && (
        <div className="mb-2">
          <div className="text-gray-400">Active Candidate Pair:</div>
          <div className="text-cyan-300">{stats.selectedCandidatePair}</div>
        </div>
      )}

      <div className="mb-2">
        <div className="text-gray-400">ICE State:</div>
        <div>{stats.iceState || 'new'}</div>
      </div>
      
      <div className="mb-2">
        <div className="text-gray-400">Connection:</div>
        <div>{stats.connectionState || 'new'}</div>
      </div>

      <div className="mb-2">
        <div className="text-gray-400">TURN Relay:</div>
        <div>{ICE_SERVERS.length > 2 ? 'Active / Configured' : 'STUN Only (Fallback)'}</div>
      </div>
      
      <div>
        <div className="text-gray-400">Media Tracks:</div>
        <div>Local Stream {stats.localMedia ? '✓' : '✗'}</div>
        <div>Remote Stream {stats.remoteMedia ? '✓' : '✗'}</div>
      </div>
    </div>
  );
};
