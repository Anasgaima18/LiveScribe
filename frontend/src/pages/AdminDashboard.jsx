import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import '../styles/AdminDashboard.css';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSessions, setActiveSessions] = useState([]);
  const [users, setUsers] = useState([]);
  const [callAnalytics, setCallAnalytics] = useState(null);
  const [alertAnalytics, setAlertAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, sessionsRes, callsRes, alertsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/sessions/active'),
        api.get('/admin/analytics/calls'),
        api.get('/admin/analytics/alerts')
      ]);

      setStats(statsRes.data);
      setActiveSessions(sessionsRes.data.activeSessions);
      setCallAnalytics(callsRes.data);
      setAlertAnalytics(alertsRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const handleUserAction = async (userId, action) => {
    try {
      await api.put(`/admin/users/${userId}`, { action });
      alert(`User ${action}ed successfully`);
      fetchUsers();
    } catch (error) {
      console.error(`Failed to ${action} user:`, error);
      alert(`Failed to ${action} user`);
    }
  };

  if (loading) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>🛡️ Admin Dashboard</h1>
        <button onClick={fetchDashboardData} className="refresh-btn">
          🔄 Refresh
        </button>
      </header>

      {/* Overview Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Users</h3>
            <p className="stat-number">{stats.overview.totalUsers}</p>
            <small>+{stats.growth.newUsers} this week</small>
          </div>
          <div className="stat-card">
            <h3>Total Calls</h3>
            <p className="stat-number">{stats.overview.totalCalls}</p>
            <small>+{stats.growth.newCalls} this week</small>
          </div>
          <div className="stat-card active">
            <h3>Active Calls</h3>
            <p className="stat-number">{stats.overview.activeCalls}</p>
            <small>Right now</small>
          </div>
          <div className="stat-card warning">
            <h3>Total Alerts</h3>
            <p className="stat-number">{stats.overview.totalAlerts}</p>
            <small>{stats.overview.criticalAlerts} critical</small>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={activeTab === 'sessions' ? 'active' : ''}
          onClick={() => setActiveTab('sessions')}
        >
          Active Sessions ({activeSessions.length})
        </button>
        <button
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => {
            setActiveTab('users');
            fetchUsers();
          }}
        >
          Users
        </button>
        <button
          className={activeTab === 'analytics' ? 'active' : ''}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && stats && (
          <div className="overview-section">
            <div className="recent-section">
              <h2>Recent Activity</h2>
              
              <div className="recent-users">
                <h3>New Users</h3>
                {stats.recent.users.map(user => (
                  <div key={user._id} className="user-item">
                    <span>{user.name}</span>
                    <small>{user.email}</small>
                    <small>{new Date(user.createdAt).toLocaleString()}</small>
                  </div>
                ))}
              </div>

              <div className="recent-alerts">
                <h3>Recent Alerts</h3>
                {stats.recent.alerts.map(alert => (
                  <div key={alert._id} className={`alert-item ${alert.severity.toLowerCase()}`}>
                    <span>{alert.userId.name}</span>
                    <span className="severity">{alert.severity}</span>
                    <small>{alert.matchedWords.join(', ')}</small>
                    <small>{new Date(alert.createdAt).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="sessions-section">
            <h2>Active Sessions</h2>
            {activeSessions.length === 0 ? (
              <p className="no-data">No active sessions</p>
            ) : (
              <div className="sessions-grid">
                {activeSessions.map(session => (
                  <div key={session.callId} className="session-card">
                    <h3>Room: {session.roomId}</h3>
                    <p>Duration: {Math.floor(session.duration / 60)}m {session.duration % 60}s</p>
                    <p>Participants: {session.participantCount}</p>
                    <div className="participants-list">
                      {session.participants.map(p => (
                        <div key={p.userId} className="participant">
                          <span>{p.name}</span>
                          <span className={`status ${p.status}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-section">
            <h2>User Management</h2>
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user._id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        onClick={() => handleUserAction(user._id, 'ban')}
                        className="btn-danger"
                      >
                        Ban
                      </button>
                      <button
                        onClick={() => handleUserAction(user._id, 'delete')}
                        className="btn-warning"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-section">
            <h2>Analytics</h2>
            
            {callAnalytics && (
              <div className="analytics-card">
                <h3>Call Analytics (Last 30 Days)</h3>
                <div className="analytics-stats">
                  <div>Total Calls: {callAnalytics.totalCalls}</div>
                  <div>Completed: {callAnalytics.completedCalls}</div>
                  <div>Active: {callAnalytics.activeCalls}</div>
                  <div>Avg Participants: {callAnalytics.avgParticipants.toFixed(2)}</div>
                </div>
              </div>
            )}

            {alertAnalytics && (
              <div className="analytics-card">
                <h3>Alert Analytics (Last 30 Days)</h3>
                <div className="analytics-stats">
                  <div>Total Alerts: {alertAnalytics.totalAlerts}</div>
                  {alertAnalytics.alertsBySeverity.map(item => (
                    <div key={item._id}>
                      {item._id}: {item.count}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
