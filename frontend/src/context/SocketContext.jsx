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
      const socketUrl = apiBase.replace('/api', '');
      const socketInstance = io(socketUrl, {
        auth: { token: user.token },
        autoConnect: true,
        transports: ['websocket']
      });
      socketRef.current = socketInstance;
      setSocket(socketInstance);

      socketInstance.on('connect', () => {
        console.log('[SOCKET] Connected:', socketInstance.id);
      });

      socketInstance.on('disconnect', () => {
        console.log('[SOCKET] Disconnected');
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
