import { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from '../socket';
import toast from 'react-hot-toast';

export const useMatchmaking = (
  chatType: 'random_text' | 'random_video' | 'random_voice',
  tags: string[],
  onSessionStart: (data: { roomId: string; partnerId: string; sessionId: string; partnerUsername: string }) => void,
  onSessionEnd: (reason: string) => void
) => {
  const [matchStatus, setMatchStatus] = useState<'idle' | 'waiting' | 'matched' | 'ended'>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partnerUsername, setPartnerUsername] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const isJoinedRef = useRef(false);

  const startSearch = useCallback(() => {
    setMatchStatus('waiting');
    setRoomId(null);
    setSessionId(null);
    setPartnerUsername(null);
    setPartnerId(null);
    setEndReason(null);
    isJoinedRef.current = true;

    socket.emit('match:join', { type: chatType, tags }, (res: any) => {
      if (res.success) {
        if (res.status === 'matched') {
          setMatchStatus('matched');
          setRoomId(res.roomId);
        }
      } else {
        toast.error(res.error || "Failed to join queue");
        setMatchStatus('idle');
      }
    });
  }, [chatType, tags]);

  const cancelSearch = useCallback(() => {
    isJoinedRef.current = false;
    socket.emit('match:leave');
    setMatchStatus('idle');
  }, []);

  const skipMatch = useCallback(() => {
    setMatchStatus('waiting');
    setRoomId(null);
    setSessionId(null);
    setPartnerUsername(null);
    setPartnerId(null);
    setEndReason(null);

    socket.emit('match:skip', null, (res: any) => {
      if (res.success) {
        startSearch();
      } else {
        toast.error(res.error || "Failed to skip");
      }
    });
  }, [startSearch]);

  const leaveChat = useCallback(() => {
    socket.emit('match:leave');
    setMatchStatus('idle');
  }, []);

  useEffect(() => {
    const handleSessionStart = (data: { roomId: string; partnerId: string; sessionId: string; partnerUsername: string }) => {
      setMatchStatus('matched');
      setRoomId(data.roomId);
      setSessionId(data.sessionId);
      setPartnerId(data.partnerId);
      setPartnerUsername(data.partnerUsername);
      socket.emit('session:joined', data);
      onSessionStart(data);
    };

    const handleSessionEnded = (data: { reason: string }) => {
      setMatchStatus('ended');
      setEndReason(data.reason);
      onSessionEnd(data.reason);
    };

    socket.on('session:start', handleSessionStart);
    socket.on('session:ended', handleSessionEnded);

    return () => {
      socket.off('session:start', handleSessionStart);
      socket.off('session:ended', handleSessionEnded);
    };
  }, [onSessionStart, onSessionEnd]);

  return {
    matchStatus,
    roomId,
    sessionId,
    partnerUsername,
    partnerId,
    endReason,
    startSearch,
    cancelSearch,
    skipMatch,
    leaveChat,
  };
};
