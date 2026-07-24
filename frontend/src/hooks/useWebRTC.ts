import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../socket';
import { ICE_SERVERS } from '../config';

export const useWebRTC = (
  roomId: string | null,
  chatType: 'random_video' | 'random_voice',
  localMicId: string,
  localCamId: string,
  onRemoteStream: (stream: MediaStream) => void,
  onRemoteVideoToggle: (enabled: boolean) => void,
  onTimeout: () => void
) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(chatType === 'random_voice');
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>('new');

  // Candidate diagnostics counters
  const [candidateCounts, setCandidateCounts] = useState({ total: 0, relay: 0, srflx: 0, host: 0 });
  const [selectedCandidatePair, setSelectedCandidatePair] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  
  // Perfect Negotiation State Refs
  const politeRef = useRef<boolean>(false);
  const makingOfferRef = useRef<boolean>(false);
  const ignoreOfferRef = useRef<boolean>(false);
  
  // ICE candidate buffer for candidate events arriving before remote description is set
  const iceCandidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescriptionRef = useRef<boolean>(false);

  // Stable callback refs
  const onRemoteStreamRef = useRef(onRemoteStream);
  const onRemoteVideoToggleRef = useRef(onRemoteVideoToggle);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onRemoteStreamRef.current = onRemoteStream;
    onRemoteVideoToggleRef.current = onRemoteVideoToggle;
    onTimeoutRef.current = onTimeout;
  }, [onRemoteStream, onRemoteVideoToggle, onTimeout]);

  const countCandidate = useCallback((candStr: string) => {
    setCandidateCounts(prev => {
      let type: 'relay' | 'srflx' | 'host' = 'host';
      if (candStr.includes('typ relay')) type = 'relay';
      else if (candStr.includes('typ srflx')) type = 'srflx';
      
      return {
        total: prev.total + 1,
        relay: type === 'relay' ? prev.relay + 1 : prev.relay,
        srflx: type === 'srflx' ? prev.srflx + 1 : prev.srflx,
        host: type === 'host' ? prev.host + 1 : prev.host,
      };
    });
  }, []);

  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
      setLocalStream(null);
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    retryCountRef.current = 0;
    iceCandidateBufferRef.current = [];
    hasRemoteDescriptionRef.current = false;
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onnegotiationneeded = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setConnectionState('closed');
    setIceConnectionState('closed');
    setCandidateCounts({ total: 0, relay: 0, srflx: 0, host: 0 });
    setSelectedCandidatePair(null);
  }, []);

  const initLocalStream = useCallback(async () => {
    try {
      stopLocalStream();
      const constraints = {
        audio: localMicId !== 'default' ? { deviceId: { exact: localMicId } } : true,
        video: chatType === 'random_video'
          ? (localCamId !== 'default' ? { deviceId: { exact: localCamId } } : true)
          : false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);

      stream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      stream.getVideoTracks().forEach(t => t.enabled = !isCamOff);

      return stream;
    } catch (e) {
      console.error("[WebRTC] Failed to get local media stream", e);
      throw e;
    }
  }, [chatType, localMicId, localCamId, isMuted, isCamOff, stopLocalStream]);

  const processIceBuffer = useCallback(async () => {
    if (!peerConnectionRef.current || !hasRemoteDescriptionRef.current) return;
    const candidates = [...iceCandidateBufferRef.current];
    iceCandidateBufferRef.current = [];
    for (const cand of candidates) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        if (!ignoreOfferRef.current) {
          console.warn("[WebRTC] Error adding buffered ICE candidate", e);
        }
      }
    }
  }, []);

  const updateCandidatePairStats = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const localCand = stats.get(report.localCandidateId);
          const remoteCand = stats.get(report.remoteCandidateId);
          if (localCand && remoteCand) {
            const pairInfo = `${localCand.candidateType} -> ${remoteCand.candidateType}`;
            setSelectedCandidatePair(pairInfo);
          }
        }
      });
    } catch (e) {}
  }, []);

  const createPeerConnection = useCallback((isCaller: boolean = false) => {
    closePeerConnection();

    politeRef.current = !isCaller; // Polite peer yields during offer collision

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });
    peerConnectionRef.current = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Perfect Negotiation: Perfect negotiation offer creation on track add/change
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        if (pc.localDescription && roomId) {
          socket.emit("webrtc:offer", { roomId, offer: pc.localDescription });
        }
      } catch (err) {
        console.error("[WebRTC Perfect Negotiation] Error in onnegotiationneeded", err);
      } finally {
        makingOfferRef.current = false;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        countCandidate(event.candidate.candidate);
        socket.emit("webrtc:ice-candidate", { roomId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        onRemoteStreamRef.current(event.streams[0]);

        const remoteVideoTrack = event.streams[0].getVideoTracks()[0];
        if (remoteVideoTrack) {
          onRemoteVideoToggleRef.current(remoteVideoTrack.enabled);
          remoteVideoTrack.onmute = () => onRemoteVideoToggleRef.current(false);
          remoteVideoTrack.onunmute = () => onRemoteVideoToggleRef.current(true);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (!peerConnectionRef.current) return;
      const state = peerConnectionRef.current.connectionState;
      setConnectionState(state);
      
      if (state === 'connected') {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        updateCandidatePairStats();
        socket.emit("webrtc:connected", { roomId });
      } else if (state === 'failed') {
        if (retryCountRef.current === 0) {
          retryCountRef.current += 1;
          console.warn("[WebRTC] Connection failed, attempting ICE restart...");
          pc.restartIce();
        } else {
          console.error("[WebRTC] Connection failed after ICE restart.");
          closePeerConnection();
          onTimeoutRef.current();
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (peerConnectionRef.current) {
        const iceState = peerConnectionRef.current.iceConnectionState;
        setIceConnectionState(iceState);
        if (iceState === 'connected' || iceState === 'completed') {
          updateCandidatePairStats();
        }
      }
    };

    // 20 seconds connection watchdog timer
    timeoutRef.current = setTimeout(() => {
      if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== 'connected') {
        console.warn("[WebRTC] Connection watchdog timeout expired.");
        closePeerConnection();
        onTimeoutRef.current();
      }
    }, 20000);

    return pc;
  }, [roomId, closePeerConnection, countCandidate, updateCandidatePairStats]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        socket.emit("webrtc:audio-toggle", { roomId, enabled: audioTrack.enabled });
      }
    }
  }, [roomId]);

  const toggleCam = useCallback(() => {
    if (chatType === 'random_voice') return;
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOff(!videoTrack.enabled);
        socket.emit("webrtc:video-toggle", { roomId, enabled: videoTrack.enabled });
      }
    }
  }, [roomId, chatType]);

  useEffect(() => {
    if (!roomId) return;

    const handleOffer = async (data: { offer: RTCSessionDescriptionInit; senderId: string }) => {
      try {
        const pc = peerConnectionRef.current;
        if (!pc) return;

        // Perfect Negotiation: Handle simultaneous offer collision (glare)
        const offerCollision =
          data.offer.type === "offer" &&
          (makingOfferRef.current || pc.signalingState !== "stable");

        ignoreOfferRef.current = !politeRef.current && offerCollision;
        if (ignoreOfferRef.current) {
          console.warn("[WebRTC Perfect Negotiation] Glare detected: impolite peer ignoring offer collision.");
          return;
        }

        if (offerCollision && politeRef.current) {
          console.log("[WebRTC Perfect Negotiation] Glare detected: polite peer rolling back local description.");
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" }),
            pc.setRemoteDescription(new RTCSessionDescription(data.offer))
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        }

        hasRemoteDescriptionRef.current = true;
        await processIceBuffer();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { roomId, answer: pc.localDescription });
      } catch (e) {
        console.error("[WebRTC Perfect Negotiation] Error processing offer or creating answer", e);
      }
    };

    const handleAnswer = async (data: { answer: RTCSessionDescriptionInit; senderId: string }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc && !ignoreOfferRef.current) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          hasRemoteDescriptionRef.current = true;
          await processIceBuffer();
        }
      } catch (e) {
        console.error("[WebRTC Perfect Negotiation] Error processing remote answer", e);
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit; senderId: string }) => {
      try {
        const pc = peerConnectionRef.current;
        if (data.candidate && data.candidate.candidate) {
          countCandidate(data.candidate.candidate);
        }

        if (!pc || !hasRemoteDescriptionRef.current) {
          iceCandidateBufferRef.current.push(data.candidate);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        if (!ignoreOfferRef.current) {
          console.warn("[WebRTC] Error adding ICE candidate", e);
        }
      }
    };

    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
    };
  }, [roomId, processIceBuffer, countCandidate]);

  useEffect(() => {
    return () => {
      closePeerConnection();
      stopLocalStream();
    };
  }, [closePeerConnection, stopLocalStream]);

  return {
    localStream,
    isMuted,
    isCamOff,
    connectionState,
    iceConnectionState,
    candidateCounts,
    selectedCandidatePair,
    initLocalStream,
    createPeerConnection,
    toggleMute,
    toggleCam,
    closePeerConnection,
    stopLocalStream,
  };
};
