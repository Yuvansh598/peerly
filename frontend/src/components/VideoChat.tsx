import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { X, Video, VideoOff, Mic, MicOff, Settings as SettingsIcon, SkipForward, Maximize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { ICE_SERVERS } from '../config';
import { WebRTCDebugPanel, type WebRTCStats } from './WebRTCDebugPanel';
import { SearchingScreen } from './SearchingScreen';
import { PartnerInfoCard } from './PartnerInfoCard';
import { CallDuration, formatDuration } from './CallDuration';
import { NetworkQuality } from './NetworkQuality';
import { DeviceSettings } from './DeviceSettings';

type PipCorner = 'tl' | 'tr' | 'bl' | 'br';

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
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(type === 'random_video');
  const hasJoinedRef = useRef(false);
  const currentRoomRef = useRef<string | null>(null);
  const currentSessionRef = useRef<string | null>(null);

  const [startTime, setStartTime] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [pipCorner, setPipCorner] = useState<PipCorner>('br');
  const [isSwapped, setIsSwapped] = useState(false);
  const [, setEndReason] = useState<string | null>(null);

  const [audioInput, setAudioInput] = useState<string>('default');
  const [videoInput, setVideoInput] = useState<string>('default');
  const [audioOutput, setAudioOutput] = useState<string>('default');

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

  const getMedia = async (audioId: string, videoId: string) => {
    try {
      const isVideo = type === 'random_video';
      const constraints: MediaStreamConstraints = {
        audio: audioId !== 'default' ? { deviceId: { exact: audioId } } : true,
        video: isVideo ? (videoId !== 'default' ? { deviceId: { exact: videoId } } : true) : false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Stop old tracks if replacing
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      localStreamRef.current = stream;
      
      // Update UI refs
      if (localVideoRef.current && isVideo) {
        localVideoRef.current.srcObject = stream;
      }
      updateStats({ localMedia: true });

      // Apply initial mute states
      stream.getAudioTracks().forEach(t => t.enabled = isAudioEnabled);
      stream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);

      // Replace tracks in peer connection if it exists
      if (peerConnectionRef.current) {
        const senders = peerConnectionRef.current.getSenders();
        stream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) sender.replaceTrack(track);
        });
      }
      return stream;
    } catch (err) {
      console.error("Failed to get local media", err);
      toast.error(type === 'random_video' ? "Camera and Microphone access denied." : "Microphone access denied.");
      handleLeave();
    }
  };

  useEffect(() => {
    if (import.meta.env.PROD && window.location.protocol !== "https:") {
      toast.error("WebRTC requires a secure context (HTTPS).");
      onLeave();
      return;
    }
    socket.connect();
    updateStats({ socketConnected: socket.connected });

    const handleSocketConnect = () => updateStats({ socketConnected: true });
    const handleSocketDisconnect = () => updateStats({ socketConnected: false });
    
    socket.on('connect', handleSocketConnect);
    socket.on('disconnect', handleSocketDisconnect);
    
    getMedia('default', 'default').then(() => {
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
    });

    return () => {
      socket.off('connect', handleSocketConnect);
      socket.off('disconnect', handleSocketDisconnect);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const initPeerConnection = (room: string, isCaller: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 10 });
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
        
        // Listen for remote track mute/unmute
        const remoteVideoTrack = event.streams[0].getVideoTracks()[0];
        if (remoteVideoTrack) {
          setIsRemoteVideoEnabled(remoteVideoTrack.enabled);
          remoteVideoTrack.onmute = () => setIsRemoteVideoEnabled(false);
          remoteVideoTrack.onunmute = () => setIsRemoteVideoEnabled(true);
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const type = event.candidate.candidate.includes('relay') ? 'relay' : event.candidate.candidate.includes('srflx') ? 'srflx' : event.candidate.candidate.includes('host') ? 'host' : 'unknown';
        updateStats(prev => ({
          ...prev,
          candidates: { ...prev.candidates, total: prev.candidates.total + 1, [type]: prev.candidates[type as keyof typeof prev.candidates] + 1 }
        }));
        socket.emit('webrtc:ice-candidate', { roomId: room, candidate: event.candidate });
      }
    };

    pc.onsignalingstatechange = () => updateStats({ signalingState: pc.signalingState });
    pc.oniceconnectionstatechange = () => {
      updateStats({ iceState: pc.iceConnectionState });
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };
    
    pc.onconnectionstatechange = () => {
      updateStats({ connectionState: pc.connectionState });
      if (pc.connectionState === 'connected' && timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    return pc;
  };

  useEffect(() => {
    socket.on('session:start', async (data) => {
      setStatus('matched');
      setRoomId(data.roomId);
      currentRoomRef.current = data.roomId;
      currentSessionRef.current = data.sessionId;
      setPartnerUsername(data.partnerUsername || null);
      updateStats({ roomId: data.roomId });
      setStartTime(Date.now());
      setEndReason(null);
      setIsSwapped(false);
      socket.emit('session:joined', data);

      const isCaller = guest.id > data.partnerId;
      const pc = initPeerConnection(data.roomId, isCaller);
      
      timeoutRef.current = setTimeout(() => {
        if (pc.connectionState !== 'connected') {
          toast.error("Connection timed out.");
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
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('webrtc:ice-candidate', async (data) => {
      const pc = peerConnectionRef.current;
      if (pc) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
      }
    });

    socket.on('session:ended', (data) => {
      setStatus('ended');
      setEndReason(data?.reason || 'disconnected');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    });

    return () => {
      socket.off('session:start');
      socket.off('session:ended');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
    };
  }, [guest.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== 'matched') return;
      if (e.key.toLowerCase() === 'm') toggleAudio();
      if (e.key.toLowerCase() === 'v' && type === 'random_video') toggleVideo();
      if (e.key === 'Escape') handleLeave();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isAudioEnabled, isVideoEnabled, type]);

  const handleEnd = () => {
    if (currentRoomRef.current && currentSessionRef.current) {
      socket.emit('match:leave');
    } else {
      onLeave();
    }
  };

  const handleLeave = () => {
    handleEnd();
    onLeave();
  };

  const handleSkip = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    socket.emit('match:skip', { type, tags });
    setStatus('waiting');
    setStartTime(null);
    setEndReason(null);
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

  const handleDeviceChange = async (deviceType: 'audioinput' | 'videoinput' | 'audiooutput', deviceId: string) => {
    if (deviceType === 'audioinput') setAudioInput(deviceId);
    if (deviceType === 'videoinput') setVideoInput(deviceId);
    if (deviceType === 'audiooutput') {
      setAudioOutput(deviceId);
      if (remoteVideoRef.current && typeof (remoteVideoRef.current as any).setSinkId === 'function') {
        (remoteVideoRef.current as any).setSinkId(deviceId);
      }
    }
    if (deviceType !== 'audiooutput') {
      await getMedia(deviceType === 'audioinput' ? deviceId : audioInput, deviceType === 'videoinput' ? deviceId : videoInput);
    }
  };

  // PIP Drag handling (simplified click-to-move for corners)
  const cyclePipCorner = () => {
    const corners: PipCorner[] = ['br', 'bl', 'tl', 'tr'];
    setPipCorner(corners[(corners.indexOf(pipCorner) + 1) % 4]);
  };

  const getPipStyle = () => {
    const margin = '24px';
    switch (pipCorner) {
      case 'tl': return { top: margin, left: margin };
      case 'tr': return { top: margin, right: margin };
      case 'bl': return { bottom: margin, left: margin };
      case 'br': return { bottom: margin, right: margin };
    }
  };

  if (status === 'waiting') return <SearchingScreen onCancel={handleLeave} />;

  const isVoice = type === 'random_voice';

  return (
    <div className="h-screen w-full bg-black flex flex-col relative overflow-hidden font-sans select-none" onClick={() => setShowControls(c => !c)}>
      <WebRTCDebugPanel stats={stats} />
      {showDeviceSettings && <DeviceSettings onClose={() => setShowDeviceSettings(false)} onDeviceChange={handleDeviceChange} currentAudio={audioInput} currentVideo={videoInput} currentOutput={audioOutput} />}

      {/* TOP BAR */}
      <div className={clsx("absolute top-0 w-full p-4 lg:p-6 flex justify-between items-start z-40 transition-transform duration-300 bg-gradient-to-b from-black/80 to-transparent", showControls ? "translate-y-0" : "-translate-y-full")}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button onClick={handleLeave} className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors border border-white/10" onClickCapture={e => e.stopPropagation()}>
              <X size={20} />
            </button>
            <div className="text-white font-bold text-lg drop-shadow-md">
              {partnerUsername ? `@${partnerUsername}` : 'Stranger'}
            </div>
            {stats.connectionState === 'connected' && peerConnectionRef.current && (
              <NetworkQuality pc={peerConnectionRef.current} />
            )}
          </div>
          {startTime && <CallDuration startTime={startTime} />}
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); setShowDeviceSettings(true); }} className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-md transition-colors border border-white/10">
            <SettingsIcon size={20} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleSkip(); }} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full backdrop-blur-md transition-all active:scale-95 border border-white/10 font-medium text-sm">
            <SkipForward size={16}/> Skip
          </button>
        </div>
      </div>

      {status === 'matched' && <PartnerInfoCard partnerUsername={partnerUsername} tags={tags} connectionState={stats.connectionState} />}

      {/* MEDIA AREA */}
      <div className="flex-1 relative w-full h-full flex items-center justify-center">
        {isVoice ? (
          // VOICE UX
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#12131a] to-[#0a0a0f] flex flex-col items-center justify-center">
            {/* Animated Waves */}
            {stats.connectionState === 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                <div className="w-[300px] h-[300px] rounded-full border border-cyan-500 animate-ping [animation-duration:3s]" />
                <div className="absolute w-[400px] h-[400px] rounded-full border border-cyan-500 animate-ping [animation-duration:3s] [animation-delay:1s]" />
              </div>
            )}
            
            <div className="relative z-10 w-40 h-40 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 p-1 mb-8 shadow-[0_0_50px_rgba(0,255,255,0.2)]">
              <div className="w-full h-full bg-[#1a1b1e] rounded-full flex items-center justify-center overflow-hidden">
                <span className="text-6xl text-white font-bold">{partnerUsername ? partnerUsername.charAt(0).toUpperCase() : '?'}</span>
              </div>
              {!isRemoteVideoEnabled && stats.connectionState === 'connected' && (
                <div className="absolute bottom-0 right-0 bg-red-500 rounded-full p-2 border-4 border-[#1a1b1e]">
                  <MicOff size={16} className="text-white" />
                </div>
              )}
            </div>
            
            <h2 className="text-3xl font-bold text-white mb-2">{partnerUsername ? `@${partnerUsername}` : 'Stranger'}</h2>
            <div className="text-cyan-400 font-medium tracking-widest uppercase text-sm animate-pulse">
              {stats.connectionState === 'connected' ? 'Connected' : stats.connectionState === 'connecting' ? 'Connecting...' : stats.connectionState}
            </div>

            <audio ref={remoteVideoRef} autoPlay />
          </div>
        ) : (
          // VIDEO UX
          <>
            {/* Main Video (Remote or Local if swapped) */}
            <div className="absolute inset-0 bg-[#0F1015]">
              <video ref={isSwapped ? localVideoRef : remoteVideoRef} autoPlay playsInline muted={isSwapped} className={clsx("w-full h-full object-cover", isSwapped && "transform scale-x-[-1]")} />
              {/* Camera Off Fallback for Remote */}
              {!isSwapped && !isRemoteVideoEnabled && (
                <div className="absolute inset-0 bg-[#0F1015] flex flex-col items-center justify-center z-10">
                  <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-4">
                    <VideoOff size={40} className="text-white/50" />
                  </div>
                  <div className="text-white font-medium">Camera Off</div>
                </div>
              )}
            </div>

            {/* PIP Video (Local or Remote if swapped) */}
            <div 
              onClick={(e) => { e.stopPropagation(); cyclePipCorner(); }}
              onDoubleClick={(e) => { e.stopPropagation(); setIsSwapped(!isSwapped); }}
              className="absolute w-32 h-48 md:w-48 md:h-72 bg-black border-2 border-white/20 rounded-2xl overflow-hidden shadow-2xl z-30 transition-all duration-500 cursor-pointer hover:scale-105 active:scale-95 group"
              style={getPipStyle()}
            >
              <video ref={isSwapped ? remoteVideoRef : localVideoRef} autoPlay playsInline muted={!isSwapped} className={clsx("w-full h-full object-cover", !isSwapped && "transform scale-x-[-1]")} />
              
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <Maximize2 size={24} className="text-white drop-shadow-md" />
              </div>

              {!isSwapped && !isVideoEnabled && (
                <div className="absolute inset-0 bg-[#1a1b1e] flex flex-col items-center justify-center">
                  <VideoOff size={24} className="text-white/50 mb-2" />
                  <div className="text-xs text-white/70">You</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* BOTTOM CONTROLS OVERLAY */}
      <div className={clsx("absolute bottom-0 w-full p-8 flex justify-center items-end z-40 transition-transform duration-300 bg-gradient-to-t from-black/90 to-transparent", showControls ? "translate-y-0" : "translate-y-full")}>
        <div className="flex items-center gap-4 md:gap-6 bg-white/10 backdrop-blur-xl border border-white/10 p-3 md:p-4 rounded-full shadow-2xl" onClickCapture={e => e.stopPropagation()}>
          <button onClick={toggleAudio} className={clsx("p-4 md:p-5 rounded-full transition-all hover:scale-110 active:scale-95 shadow-lg", isAudioEnabled ? "bg-white/10 hover:bg-white/20 text-white" : "bg-red-500 text-white")}>
            {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
          </button>
          
          <button onClick={handleLeave} className="bg-red-500 hover:bg-red-600 text-white p-5 md:p-6 rounded-full transition-all hover:scale-110 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
            <X size={28} />
          </button>
          
          {type === 'random_video' && (
            <button onClick={toggleVideo} className={clsx("p-4 md:p-5 rounded-full transition-all hover:scale-110 active:scale-95 shadow-lg", isVideoEnabled ? "bg-white/10 hover:bg-white/20 text-white" : "bg-red-500 text-white")}>
              {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
            </button>
          )}
        </div>
      </div>

      {/* ENDED MODAL */}
      {status === 'ended' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#1a1b1e] border border-white/10 shadow-2xl rounded-3xl p-8 max-w-sm w-full text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <X size={32} className="text-red-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Partner left</h3>
            <p className="text-[var(--color-text-secondary)] mb-8 font-medium">
              Duration: {startTime ? formatDuration(Date.now() - startTime) : '00:00'}
            </p>
            <div className="flex flex-col gap-3 w-full">
              <button onClick={(e) => { e.stopPropagation(); handleSkip(); }} className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-4 rounded-xl transition-all active:scale-95 w-full text-lg shadow-[0_0_15px_rgba(0,255,255,0.3)]">
                Find New Match
              </button>
              <button onClick={(e) => { e.stopPropagation(); onLeave(); }} className="bg-white/5 hover:bg-white/10 text-white font-semibold py-4 rounded-xl transition-all active:scale-95 w-full border border-white/5">
                Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
