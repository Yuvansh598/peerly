import { useEffect, useState, useCallback } from 'react';
import { socket, connectSocket } from '../socket';

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      setReconnectAttempt(0);
    };

    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      // Auto-reconnect triggered if server drops connection unexpectedly
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        setIsReconnecting(false);
      } else {
        setIsReconnecting(true);
      }
    };

    const handleReconnectAttempt = (attempt: number) => {
      setIsReconnecting(true);
      setReconnectAttempt(attempt);
    };

    const handleConnectError = () => {
      setIsConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
    };
  }, []);

  const reconnect = useCallback((token: string) => {
    connectSocket(token);
  }, []);

  return {
    socket,
    isConnected,
    isReconnecting,
    reconnectAttempt,
    reconnect,
  };
};
