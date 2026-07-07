import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useMatchmaking } from '../hooks/useMatchmaking';
import { useResponsive } from '../hooks/useResponsive';

import { X, Video, VideoOff, Mic, MicOff, Settings as SettingsIcon, SkipForward, Maximize2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { WebRTCDebugPanel, type WebRTCStats } from './WebRTCDebugPanel';
import { SearchingScreen } from './SearchingScreen';
import { PartnerInfoCard } from './PartnerInfoCard';
import { CallDuration, formatDuration } from './CallDuration';
import { DeviceSettings } from './DeviceSettings';

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Avatar } from './ui/Avatar';
import { ConnectionStatus } from './ui/ConnectionStatus';
import { AudioVisualizer } from './ui/AudioVisualizer';
import { motion, AnimatePresence } from 'framer-motion';

type PipCorner = 'tl' | 'tr' | 'bl' | 'br';

export const VideoChat = ({ guest, onLeave, tags = [], type = 'random_video' }: { guest: any; onLeave: () => void; tags?: string[], type?: 'random_video' | 'random_voice' }) => {
  const { isMobile } = useResponsive();
  const { socket, isConnected, isReconnecting } = useSocket();
  
  // Media device state management
  const {
    devices,
    activeAudioInput,
    activeVideoInput,
    activeAudioOutput,
    requestPermissions,
    setAudioInput,
    setVideoInput,
    setAudioOutput
  } = useMediaDevices();

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(type === 'random_video');
  const [partnerUsernameState, setPartnerUsernameState] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  
  const [showControls, setShowControls] = useState(true);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [pipCorner, setPipCorner] = useState<PipCorner>('br');
  const [isSwapped, setIsSwapped] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebRTC Stats tracking
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

  const onTimeout = useCallback(() => {
    toast.error("WebRTC connection negotiation timed out. Rematching...");
    handleSkip();
  }, []);

  // WebRTC custom hook usage
  const {
    localStream,
    isMuted,
    isCamOff,
    connectionState,
    iceConnectionState,
    initLocalStream,
    createPeerConnection,
    toggleMute,
    toggleCam,
    closePeerConnection,
    stopLocalStream
  } = useWebRTC(
    stats.roomId,
    type,
    activeAudioInput,
    activeVideoInput,
    (stream) => {
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      setStats(prev => ({ ...prev, remoteMedia: true }));
    },
    (enabled) => {
      setIsRemoteVideoEnabled(enabled);
    },
    onTimeout
  );

  // Matchmaking custom hook usage
  const {
    matchStatus,
    roomId,
    startSearch,
    skipMatch,
    leaveChat
  } = useMatchmaking(
    type,
    tags,
    async (data) => {
      setPartnerUsernameState(data.partnerUsername);
      setStats(prev => ({
        ...prev,
        roomId: data.roomId,
        role: guest.id > data.partnerId ? 'Caller' : 'Callee'
      }));
      setStartTime(Date.now());
      
      await initLocalStream();
      const isCaller = guest.id > data.partnerId;
      const pc = createPeerConnection(isCaller);

      if (isCaller) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:offer', { roomId: data.roomId, offer });
        } catch (e) {
          console.error("Failed to create WebRTC offer", e);
        }
      }
    },
    (_reason) => {
      closePeerConnection();
    }
  );

  // Sync state to visual debugging panel
  useEffect(() => {
    setStats(prev => ({
      ...prev,
      socketConnected: isConnected,
      roomId,
      signalingState: stats.signalingState,
      iceState: iceConnectionState,
      connectionState: connectionState,
      localMedia: !!localStream,
    }));
  }, [isConnected, roomId, connectionState, iceConnectionState, localStream]);

  // Sync local preview stream
  useEffect(() => {
    if (localVideoRef.current && localStream && type === 'random_video') {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, type]);

  // Initialize media device permissions and start search
  useEffect(() => {
    requestPermissions(type === 'random_video').then((granted) => {
      if (granted) {
        startSearch();
      } else {
        onLeave();
      }
    });

    return () => {
      closePeerConnection();
      stopLocalStream();
    };
  }, []);

  // Controls Autohide timer logic
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (matchStatus === 'matched') {
        setShowControls(false);
      }
    }, 3000);
  }, [matchStatus]);

  useEffect(() => {
    if (matchStatus === 'matched') {
      resetControlsTimeout();
    } else {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [matchStatus, resetControlsTimeout]);

  // Audio/Video toggles with toast notifications
  const handleToggleMute = () => {
    toggleMute();
    toast.success(isMuted ? "Microphone active" : "Microphone muted");
  };

  const handleToggleCam = () => {
    toggleCam();
    toast.success(isCamOff ? "Camera active" : "Camera off");
  };

  const handleSkip = () => {
    closePeerConnection();
    stopLocalStream();
    skipMatch();
  };

  const handleLeave = () => {
    closePeerConnection();
    stopLocalStream();
    leaveChat();
    onLeave();
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
    // Re-initialize local media with new choice
    setTimeout(async () => {
      await initLocalStream();
    }, 100);
  };

  const cyclePipCorner = () => {
    const corners: PipCorner[] = ['br', 'bl', 'tl', 'tr'];
    setPipCorner(corners[(corners.indexOf(pipCorner) + 1) % 4]);
  };

  const getPipStyle = () => {
    const margin = isMobile ? '16px' : '24px';
    switch (pipCorner) {
      case 'tl': return { top: margin, left: margin };
      case 'tr': return { top: margin, right: margin };
      case 'bl': return { bottom: margin, left: margin };
      case 'br': return { bottom: margin, right: margin };
    }
  };

  if (matchStatus === 'waiting') return <SearchingScreen onCancel={handleLeave} />;

  const isVoice = type === 'random_voice';

  return (
    <div 
      className="h-screen w-full bg-[#070913] flex flex-col relative overflow-hidden font-sans select-none"
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
    >
      {/* Visual Debug stats panel */}
      <WebRTCDebugPanel stats={stats} />
      
      {/* Reconnecting Overlay state */}
      {isReconnecting && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4">
          <RefreshCw className="animate-spin text-[#00f0ff] w-10 h-10" />
          <div className="text-xl font-bold text-white tracking-wide">Reconnecting...</div>
          <div className="text-sm text-gray-500">Standby, attempting connection restoration</div>
        </div>
      )}

      {showDeviceSettings && (
        <DeviceSettings 
          onClose={() => setShowDeviceSettings(false)} 
          onDeviceChange={handleDeviceChange} 
          devices={devices}
          currentAudio={activeAudioInput} 
          currentVideo={activeVideoInput} 
          currentOutput={activeAudioOutput} 
        />
      )}

      {/* TOP HEADER CONTROLS BAR */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 w-full p-4 lg:p-6 flex justify-between items-start z-40 bg-gradient-to-b from-black/90 to-transparent pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <button onClick={handleLeave} className="bg-white/5 hover:bg-white/10 hover:border-white/20 text-white rounded-full p-2.5 backdrop-blur-md transition-all border border-white/5 cursor-pointer">
                  <X size={18} />
                </button>
                <div className="text-white font-bold text-base md:text-lg">
                  {partnerUsernameState ? `@${partnerUsernameState}` : 'Stranger'}
                </div>
                <div className="hidden sm:block">
                  <ConnectionStatus status={connectionState} />
                </div>
              </div>
              {startTime && <CallDuration startTime={startTime} />}
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDeviceSettings(true)} className="bg-white/5 hover:bg-white/10 hover:border-white/20 text-white rounded-full p-2.5 backdrop-blur-md transition-all border border-white/5 cursor-pointer">
                <SettingsIcon size={18} />
              </button>
              <Button onClick={handleSkip} variant="glass" className="h-10 px-4 text-sm font-semibold border-white/5 hover:border-white/10">
                <SkipForward size={14}/> Skip
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {matchStatus === 'matched' && (
        <PartnerInfoCard partnerUsername={partnerUsernameState} tags={tags} connectionState={connectionState} />
      )}

      {/* VIDEO / VOICE INTERACTION MEDIA DISPLAY */}
      <div className="flex-1 relative w-full h-full flex items-center justify-center">
        {isVoice ? (
          // VOICE LAYOUT RENDER
          <div className="absolute inset-0 bg-gradient-to-br from-[#070913] via-[#0d1121] to-[#070913] flex flex-col items-center justify-center p-6">
            <div className="relative mb-8">
              {/* Audio Rings */}
              <Avatar username={partnerUsernameState || '?'} size="xl" speaking={connectionState === 'connected'} />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">{partnerUsernameState ? `@${partnerUsernameState}` : 'Stranger'}</h2>
            
            <div className="text-xs font-semibold tracking-widest uppercase text-gray-500 mb-8">
              {connectionState === 'connected' ? 'Connected Voice Chat' : 'Establishing Signaling...'}
            </div>

            {connectionState === 'connected' && (
              <AudioVisualizer stream={remoteStream} speaking={true} />
            )}

            <audio ref={remoteVideoRef} autoPlay />
          </div>
        ) : (
          // VIDEO LAYOUT RENDER
          <>
            {/* Full screen main view (remote stream, or local if swapped) */}
            <div className="absolute inset-0 bg-[#070913]">
              <video ref={isSwapped ? localVideoRef : remoteVideoRef} autoPlay playsInline className={clsx("w-full h-full object-cover", isSwapped && "transform scale-x-[-1]")} />
              
              {!isSwapped && !isRemoteVideoEnabled && (
                <div className="absolute inset-0 bg-[#070913] flex flex-col items-center justify-center z-10 select-none">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-3 border border-white/5">
                    <VideoOff size={32} className="text-gray-500" />
                  </div>
                  <div className="text-gray-400 text-sm font-semibold">Stranger's camera is off</div>
                </div>
              )}
            </div>

            {/* Draggable PiP View (local feed or remote if swapped) */}
            <div 
              onClick={(e) => { e.stopPropagation(); cyclePipCorner(); }}
              onDoubleClick={(e) => { e.stopPropagation(); setIsSwapped(!isSwapped); }}
              className="absolute w-28 h-40 md:w-44 md:h-64 bg-black border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-30 transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95 group"
              style={getPipStyle()}
            >
              <video ref={isSwapped ? remoteVideoRef : localVideoRef} autoPlay playsInline muted={!isSwapped} className={clsx("w-full h-full object-cover", !isSwapped && "transform scale-x-[-1]")} />
              
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <Maximize2 size={20} className="text-white" />
              </div>

              {!isSwapped && isCamOff && (
                <div className="absolute inset-0 bg-[#0d1121] flex flex-col items-center justify-center">
                  <VideoOff size={20} className="text-gray-500 mb-1" />
                  <div className="text-[10px] text-gray-400 font-semibold">Camera Off</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* BOTTOM CONTROL OVERLAY PANEL */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 w-full p-6 flex justify-center items-end z-40 bg-gradient-to-t from-black/90 to-transparent pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-4 bg-white/5 backdrop-blur-xl border border-white/5 p-3 rounded-full shadow-2xl">
              <button 
                onClick={handleToggleMute} 
                className={clsx(
                  "p-3.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer",
                  !isMuted ? "bg-white/5 hover:bg-white/10 text-white" : "bg-red-500 text-white"
                )}
              >
                {!isMuted ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              
              <button 
                onClick={handleLeave} 
                className="bg-red-500 hover:bg-red-600 text-white p-4.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.3)] cursor-pointer"
              >
                <X size={24} />
              </button>
              
              {!isVoice && (
                <button 
                  onClick={handleToggleCam} 
                  className={clsx(
                    "p-3.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer",
                    !isCamOff ? "bg-white/5 hover:bg-white/10 text-white" : "bg-red-500 text-white"
                  )}
                >
                  {!isCamOff ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DISCONNECTED OR HANGUP MODAL */}
      <AnimatePresence>
        {matchStatus === 'ended' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm"
            >
              <Card glow className="p-8 text-center flex flex-col items-center border border-white/10">
                <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mb-4">
                  <X size={32} className="text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Call Disconnected</h3>
                <p className="text-gray-400 text-sm mb-6 font-medium">
                  Call duration: {startTime ? formatDuration(Date.now() - startTime) : '00:00'}
                </p>
                <div className="flex flex-col gap-3 w-full">
                  <Button onClick={handleSkip} variant="primary" className="w-full">
                    Find New Match
                  </Button>
                  <Button onClick={handleLeave} variant="secondary" className="w-full">
                    Back to Dashboard
                  </Button>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
