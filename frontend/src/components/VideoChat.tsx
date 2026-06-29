import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { X, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { ICE_SERVERS } from '../config';
import { WebRTCDebugPanel, type WebRTCStats } from './WebRTCDebugPanel';

export const VideoChat = ({ guest, onLeave, tags = [], type = 'random_video' }: { guest: any; onLeave: () => void; tags?: string[], type?: 'random_video' | 'random_voice' }) => {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'matched' | 'ended'>('idle');
  const [partnerUsername, setPartnerUsername] = useState<string | null>(null);
  const [, setRoomId] = useState<string | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [isVideoEnabled, setIsVideoEnabled] = useState(type === 'random_video');
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const hasJoinedRef = useRef(false);
  const currentRoomRef = useRef<string | null>(null);

  const [stats, setStats] = useState<WebRTCStats>({
    socketConnected: socket.connected,
    roomId: null,
    role: null,
    signalingState: 'new',
    iceState: 'new',
    connectionState: 'new',
    candidates: { total: 0, relay: 0, srflx: 0, host: 0 },
    localMedia: false,
    remoteMedia: false,
  });

  const updateStats = (update: Partial<WebRTCStats> | ((prev: WebRTCStats) => WebRTCStats)) => {
    setStats((prev) => typeof update === 'function' ? update(prev) : { ...prev, ...update });
  };

  useEffect(() => {
    if (import.meta.env.PROD && window.location.protocol !== "https:") {
      toast.error("WebRTC requires a secure context (HTTPS).");
      onLeave();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Media devices not supported in this browser.");
      onLeave();
      return;
    }

    socket.connect();
    updateStats({ socketConnected: socket.connected });

    const handleSocketConnect = () => updateStats({ socketConnected: true });
    const handleSocketDisconnect = () => updateStats({ socketConnected: false });
    
    socket.on('connect', handleSocketConnect);
    socket.on('disconnect', handleSocketDisconnect);
    
    const isVideo = type === 'random_video';
    navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        updateStats({ localMedia: true });
        if (localVideoRef.current && isVideo) {
          localVideoRef.current.srcObject = stream;
        }
        
        if (!hasJoinedRef.current) {
          hasJoinedRef.current = true;
          setStatus('waiting');
          socket.emit('match:join', { guestId: guest.id, type, tags }, (res: any) => {
            if (res.status === 'matched') {
              setStatus('matched');
              setRoomId(res.roomId);
              currentRoomRef.current = res.roomId;
              updateStats({ roomId: res.roomId });
            }
          });
        }
      })
      .catch(err => {
        console.error("Failed to get local media", err);
        toast.error(isVideo ? "Camera and Microphone access are required." : "Microphone access is required.");
        onLeave();
      });

    const initPeerConnection = (room: string, isCaller: boolean) => {
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 10
      });
      peerConnectionRef.current = pc;
      
      updateStats({ role: isCaller ? 'Caller' : 'Callee' });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          updateStats({ remoteMedia: true });
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const type = event.candidate.candidate.includes('relay') ? 'relay' 
                      : event.candidate.candidate.includes('srflx') ? 'srflx' 
                      : event.candidate.candidate.includes('host') ? 'host' : 'unknown';
          
          updateStats(prev => ({
            ...prev,
            candidates: {
              ...prev.candidates,
              total: prev.candidates.total + 1,
              [type]: prev.candidates[type as keyof typeof prev.candidates] + 1
            }
          }));
          socket.emit('webrtc:ice-candidate', { roomId: room, candidate: event.candidate });
        }
      };

      pc.onsignalingstatechange = () => updateStats({ signalingState: pc.signalingState });
      pc.oniceconnectionstatechange = () => {
        updateStats({ iceState: pc.iceConnectionState });
        if (pc.iceConnectionState === 'failed') {
          console.warn("ICE Connection failed, attempting restart...");
          pc.restartIce();
        }
      };
      
      pc.onconnectionstatechange = () => {
        updateStats({ connectionState: pc.connectionState });
        if (pc.connectionState === 'connected') {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
        }
      };

      return pc;
    };

    socket.on('session:start', async (data) => {
      setStatus('matched');
      setRoomId(data.roomId);
      currentRoomRef.current = data.roomId;
      setPartnerUsername(data.partnerUsername || null);
      updateStats({ roomId: data.roomId });
      socket.emit('session:joined', data);

      const isCaller = guest.id > data.partnerId;
      const pc = initPeerConnection(data.roomId, isCaller);
      
      timeoutRef.current = setTimeout(() => {
        if (pc.connectionState !== 'connected') {
          toast.error("Connection timed out. Partner may have network issues.");
          handleEnd();
        }
      }, 30000);
      
      if (isCaller) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:offer', { roomId: data.roomId, offer });
        } catch (e) {
          console.error("Failed to create offer", e);
        }
      }
    });

    socket.on('webrtc:offer', async (data) => {
      const room = currentRoomRef.current;
      if (!room) return;
      const pc = peerConnectionRef.current || initPeerConnection(room, false);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { roomId: room, answer });
    });

    socket.on('webrtc:answer', async (data) => {
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socket.on('webrtc:ice-candidate', async (data) => {
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Error adding ice candidate", e);
        }
      }
    });

    socket.on('session:ended', () => {
      setStatus('ended');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    });

    return () => {
      socket.off('connect', handleSocketConnect);
      socket.off('disconnect', handleSocketDisconnect);
      socket.off('session:start');
      socket.off('session:ended');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleEnd = () => {
    socket.emit('match:leave');
    onLeave();
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  return (
    <div className="h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center p-4">
      <WebRTCDebugPanel stats={stats} />
      {status === 'waiting' && (
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold mb-2">Looking for someone...</h2>
          <button onClick={handleEnd} className="mt-8 text-[var(--color-text-secondary)] hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      )}

      {(status === 'matched' || status === 'ended') && (
        <div className="w-full max-w-5xl h-[80vh] bg-[#1a1b1e] rounded-2xl overflow-hidden flex flex-col relative border border-[var(--color-border)] shadow-2xl">
          {/* HEADER */}
          <div className="h-16 border-b border-[var(--color-border)] bg-[#141517] flex items-center justify-between px-6 shrink-0 z-10">
            <div className="flex items-center gap-4">
              <button onClick={handleEnd} className="text-[var(--color-text-secondary)] hover:text-white flex items-center gap-2">
                <X size={20} /> Leave
              </button>
              <div className="font-mono text-[var(--color-text-primary)] font-bold">
                {partnerUsername ? `@${partnerUsername}` : 'Stranger'}
              </div>
            </div>
          </div>
          
          {/* VIDEO AREA */}
          <div className="flex-1 relative bg-black flex items-center justify-center">
            {/* Remote Video */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            
            {/* Local Video Picture-in-Picture */}
            <div className="absolute bottom-6 right-6 w-48 h-72 bg-black border-2 border-[var(--color-border)] rounded-xl overflow-hidden shadow-lg z-10">
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
            </div>

            {status === 'ended' && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm z-20">
                <div className="text-center">
                  <div className="text-xl font-bold mb-6 text-white">Partner has left the chat</div>
                  <button 
                    onClick={() => {
                      setStatus('waiting');
                      socket.emit('match:join', { guestId: guest.id, type, tags });
                    }}
                    className="bg-[var(--color-accent)] text-[var(--color-bg)] font-bold px-8 py-3 rounded-xl hover:bg-[#33dfff] transition-all"
                  >
                    Find New Match
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CONTROLS */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 z-10">
            <button 
              onClick={toggleAudio}
              className={clsx("p-4 rounded-full transition-all", isAudioEnabled ? "bg-[#333] hover:bg-[#444] text-white" : "bg-red-500 hover:bg-red-600 text-white")}
            >
              {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            <button 
              onClick={handleEnd}
              className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-full transition-all shadow-lg"
            >
              <X size={24} />
            </button>
            {type === 'random_video' && (
              <button 
                onClick={toggleVideo}
                className={clsx("p-4 rounded-full transition-all", isVideoEnabled ? "bg-[#333] hover:bg-[#444] text-white" : "bg-red-500 hover:bg-red-600 text-white")}
              >
                {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
