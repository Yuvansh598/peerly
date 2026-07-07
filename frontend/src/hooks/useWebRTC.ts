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

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // Apply initial toggled states
      stream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      stream.getVideoTracks().forEach(t => t.enabled = !isCamOff);

      return stream;
    } catch (e) {
      console.error("Failed to get local media stream", e);
      throw e;
    }
  }, [chatType, localMicId, localCamId, isMuted, isCamOff, stopLocalStream]);

  const createPeerConnection = useCallback((_isCaller?: boolean) => {
    closePeerConnection();

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

    pc.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        socket.emit("webrtc:ice-candidate", { roomId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        onRemoteStream(event.streams[0]);

        const remoteVideoTrack = event.streams[0].getVideoTracks()[0];
        if (remoteVideoTrack) {
          onRemoteVideoToggle(remoteVideoTrack.enabled);
          remoteVideoTrack.onmute = () => onRemoteVideoToggle(false);
          remoteVideoTrack.onunmute = () => onRemoteVideoToggle(true);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'connected') {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        socket.emit("webrtc:connected", { roomId });
      }
      if (pc.connectionState === 'failed') {
        pc.restartIce();
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
    };

    // 15 seconds connection watchdog timer
    timeoutRef.current = setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        closePeerConnection();
        onTimeout();
      }
    }, 15000);

    return pc;
  }, [roomId, onRemoteStream, onRemoteVideoToggle, onTimeout, closePeerConnection]);

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
        const pc = peerConnectionRef.current || createPeerConnection(false);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { roomId, answer });
      } catch (e) {
        console.error("Error setting offer or creating answer", e);
      }
    };

    const handleAnswer = async (data: { answer: RTCSessionDescriptionInit; senderId: string }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      } catch (e) {
        console.error("Error setting remote answer", e);
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit; senderId: string }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (e) {
        // Safe to ignore candidate failures during ICE teardown
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
  }, [roomId, createPeerConnection]);

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
    initLocalStream,
    createPeerConnection,
    toggleMute,
    toggleCam,
    closePeerConnection,
    stopLocalStream,
  };
};
