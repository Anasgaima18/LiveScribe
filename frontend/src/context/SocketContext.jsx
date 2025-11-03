import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (user && user.token) {
      // Ensure only one connection
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      const apiBase = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;
      const socketUrl = (import.meta.env.VITE_SOCKET_URL || apiBase.replace('/api', ''));
      const socketInstance = io(socketUrl, {
        auth: { token: user.token },
        autoConnect: true,
        // Allow Engine.IO to fall back to polling first, then upgrade to websocket
        transports: ['websocket', 'polling'],
        withCredentials: true,
        path: '/socket.io',
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: true,
      });
      socketRef.current = socketInstance;
      setSocket(socketInstance);

      socketInstance.on('connect', () => {
        console.log('[SOCKET] Connected:', socketInstance.id);
      });

      socketInstance.on('disconnect', () => {
        console.log('[SOCKET] Disconnected');
      });

      // Helpful diagnostics
      socketInstance.io.on('reconnect_attempt', (attempt) => {
        console.log('[SOCKET] Reconnect attempt:', attempt);
      });
      socketInstance.io.on('reconnect_error', (err) => {
        console.warn('[SOCKET] Reconnect error:', err?.message || err);
      });
      socketInstance.io.on('error', (err) => {
        console.warn('[SOCKET] IO error:', err?.message || err);
      });
      socketInstance.on('connect_error', (err) => {
        console.warn('[SOCKET] Connect error:', err?.message || err);
      });

      return () => {
        socketInstance.disconnect();
      };
    } else if (socketRef.current) {
      socketRef.current.disconnect();
      setSocket(null);
    }
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
