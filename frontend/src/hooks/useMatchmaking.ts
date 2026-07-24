import { useState, useEffect, useCallback, useRef } from 'react';
import { socket } from '../socket';
import toast from 'react-hot-toast';

export const useMatchmaking = (
  chatType: 'random_text' | 'random_video' | 'random_voice',
  tags: string[],
  onSessionStart: (data: { roomId: string; partnerId: string; sessionId: string; partnerUsername: string; isCaller: boolean }) => void,
  onSessionEnd: (reason: string) => void
) => {
  const [matchStatus, setMatchStatus] = useState<'idle' | 'waiting' | 'matched' | 'ended'>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partnerUsername, setPartnerUsername] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isCaller, setIsCaller] = useState<boolean>(false);
  const [endReason, setEndReason] = useState<string | null>(null);

  const isJoiningRef = useRef(false);
  const statusRef = useRef(matchStatus);
  const onSessionStartRef = useRef(onSessionStart);
  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    statusRef.current = matchStatus;
  }, [matchStatus]);

  useEffect(() => {
    onSessionStartRef.current = onSessionStart;
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionStart, onSessionEnd]);

  const startSearch = useCallback(() => {
    if (isJoiningRef.current) return;
    isJoiningRef.current = true;

    setMatchStatus('waiting');
    setRoomId(null);
    setSessionId(null);
    setPartnerUsername(null);
    setPartnerId(null);
    setIsCaller(false);
    setEndReason(null);

    const executeJoin = () => {
      socket.emit('match:join', { type: chatType, tags }, (res: any) => {
        isJoiningRef.current = false;
        if (res && res.success) {
          if (res.status === 'matched') {
            setMatchStatus('matched');
            setRoomId(res.roomId);
          }
        } else {
          toast.error(res?.error || "Failed to join matchmaking queue");
          setMatchStatus('idle');
        }
      });
    };

    if (socket.connected) {
      executeJoin();
    } else {
      socket.once('connect', () => {
        executeJoin();
      });
      socket.connect();
    }
  }, [chatType, tags]);

  const cancelSearch = useCallback(() => {
    isJoiningRef.current = false;
    socket.emit('match:leave');
    setMatchStatus('idle');
    setRoomId(null);
    setSessionId(null);
  }, []);

  const skipMatch = useCallback(() => {
    isJoiningRef.current = true;
    setMatchStatus('waiting');
    setRoomId(null);
    setSessionId(null);
    setPartnerUsername(null);
    setPartnerId(null);
    setIsCaller(false);
    setEndReason(null);

    socket.emit('match:skip', null, (res: any) => {
      isJoiningRef.current = false;
      if (res && res.success) {
        startSearch();
      } else {
        toast.error(res?.error || "Failed to skip");
        setMatchStatus('idle');
      }
    });
  }, [startSearch]);

  const leaveChat = useCallback(() => {
    isJoiningRef.current = false;
    socket.emit('match:leave');
    setMatchStatus('idle');
    setRoomId(null);
    setSessionId(null);
    setPartnerId(null);
    setPartnerUsername(null);
  }, []);

  useEffect(() => {
    const handleConnect = () => {
      if (statusRef.current === 'waiting' && !isJoiningRef.current) {
        isJoiningRef.current = true;
        socket.emit('match:join', { type: chatType, tags }, (res: any) => {
          isJoiningRef.current = false;
          if (res && res.success && res.status === 'matched') {
            setMatchStatus('matched');
            setRoomId(res.roomId);
          }
        });
      }
    };

    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [chatType, tags]);

  useEffect(() => {
    const handleSessionStart = (data: { roomId: string; partnerId: string; sessionId: string; partnerUsername: string; isCaller?: boolean }) => {
      isJoiningRef.current = false;
      setMatchStatus('matched');
      setRoomId(data.roomId);
      setSessionId(data.sessionId);
      setPartnerId(data.partnerId);
      setPartnerUsername(data.partnerUsername);
      const callerFlag = data.isCaller ?? false;
      setIsCaller(callerFlag);

      onSessionStartRef.current({
        roomId: data.roomId,
        partnerId: data.partnerId,
        sessionId: data.sessionId,
        partnerUsername: data.partnerUsername,
        isCaller: callerFlag
      });
    };

    const handleSessionEnded = (data: { reason: string }) => {
      isJoiningRef.current = false;
      setMatchStatus('ended');
      setEndReason(data.reason);
      onSessionEndRef.current(data.reason);
    };

    socket.on('session:start', handleSessionStart);
    socket.on('session:ended', handleSessionEnded);

    return () => {
      socket.off('session:start', handleSessionStart);
      socket.off('session:ended', handleSessionEnded);
    };
  }, []);

  return {
    matchStatus,
    roomId,
    sessionId,
    partnerUsername,
    partnerId,
    isCaller,
    endReason,
    startSearch,
    cancelSearch,
    skipMatch,
    leaveChat,
  };
};
