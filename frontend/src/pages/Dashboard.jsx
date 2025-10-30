import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../utils/api';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      console.log('[SOCKET] Received call:invitation', data);
      alert(`Incoming call from ${data.from?.name || 'unknown'}! Join room: ${data.roomId}`);
    };
    socket.on('call:invitation', handler);
    return () => socket.off('call:invitation', handler);
  }, [socket]);

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/auth/users');
      // Filter out current user and ensure data is array
      const filteredUsers = Array.isArray(data) 
        ? data.filter(u => u && u._id !== user?._id) 
        : [];
      setUsers(filteredUsers);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('Failed to load users');
      setUsers([]); // Set empty array on error
      setLoading(false);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const startCall = async () => {
    if (selectedUsers.length === 0) {
      alert('Please select at least one user to call');
      return;
    }

    const roomId = `room-${Date.now()}`;
    
    try {
      await api.post('/calls', {
        roomId,
        participants: selectedUsers
      });
      navigate(`/room/${roomId}`);
    } catch (err) {
      console.error('Failed to create call:', err);
      alert('Failed to start call');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>LiveKit Video Call</h1>
        <div className="user-info">
          <span>Welcome, {user?.name}</span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="users-section">
          <h2>Available Users</h2>
          {error && <div className="error-message">{error}</div>}
          
          {users.length === 0 ? (
            <p className="no-users">No other users available</p>
          ) : (
            <div className="users-grid">
              {users.map((u) => (
                <div
                  key={u._id}
                  className={`user-card ${selectedUsers.includes(u._id) ? 'selected' : ''}`}
                  onClick={() => toggleUserSelection(u._id)}
                >
                  <div className="user-avatar">
                    {u.name ? u.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div className="user-details">
                    <h3>{u.name || 'Unknown User'}</h3>
                    <p>{u.email || 'No email'}</p>
                  </div>
                  {selectedUsers.includes(u._id) && (
                    <div className="selected-badge">✓</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="action-section">
          <button
            onClick={startCall}
            className="btn-call"
            disabled={selectedUsers.length === 0}
          >
            Start Video Call ({selectedUsers.length} selected)
          </button>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
