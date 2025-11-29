import { useState, useEffect, useRef, useContext } from 'react';
import { ArrowLeft, Camera, Trash2, Monitor } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ToastContext } from '../App';
import ConfirmDialog from './ConfirmDialog';
import { getApiUrl, getAssetUrl } from '../config/api';

function Settings({ user, onUpdateUser }) {
  const navigate = useNavigate();
  const toast = useContext(ToastContext);
  const fileInputRef = useRef(null);

  // Use imported getAssetUrl helper
  const getAvatarUrl = getAssetUrl;
  
  // Handle case where user is not loaded yet
  if (!user) {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return null;
    }
    user = JSON.parse(storedUser);
  }
  
  const [bio, setBio] = useState(user?.bio || 'Hey there! I am using Connect.');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [sessions, setSessions] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Confirmation dialog states
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch(getApiUrl(`api/users/sessions/${user.id}`));
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG and PNG images are allowed');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      return;
    }

    try {
      setUploading(true);

      // Create FormData with 'avatar' key for secure endpoint
      const formData = new FormData();
      formData.append('avatar', file);
      formData.append('userId', user.id);

      const response = await fetch(getApiUrl('api/users/avatar'), {
        method: 'PUT',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const { avatar_url } = await response.json();
      
      // Update local state with Base64 Data URI
      setAvatarUrl(avatar_url);

      // Update user context/localStorage immediately
      const updatedUser = { ...user, avatar_url };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      if (onUpdateUser) {
        onUpdateUser(updatedUser);
      }

      toast.success('Avatar updated successfully!');
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Profile Picture',
      message: 'Are you sure you want to remove your profile picture?',
      onConfirm: async () => {
        try {
          setUploading(true);

          const response = await fetch(getApiUrl('api/users/profile'), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: user.id,
              avatarUrl: null
            })
          });

          if (!response.ok) {
            throw new Error('Failed to remove avatar');
          }

          // Update local state
          setAvatarUrl('');

          // Update user context/localStorage
          const updatedUser = { ...user, avatar_url: null };
          localStorage.setItem('user', JSON.stringify(updatedUser));
          if (onUpdateUser) {
            onUpdateUser(updatedUser);
          }

          toast.success('Profile picture removed successfully!');
        } catch (error) {
          console.error('Error removing avatar:', error);
          toast.error('Failed to remove profile picture');
        } finally {
          setUploading(false);
        }
      }
    });
  };

  const saveProfile = async (bioText, avatar) => {
    try {
      setSaving(true);

      const response = await fetch(getApiUrl('api/users/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          bio: bioText,
          avatarUrl: avatar !== undefined ? avatar : avatarUrl
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const updatedUser = await response.json();
      onUpdateUser(updatedUser);
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBio = () => {
    saveProfile(bio, avatarUrl);
  };

  const handleRevokeSession = async (sessionId) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Revoke Session',
      message: 'Are you sure you want to revoke this session? The user will be logged out from that device.',
      onConfirm: async () => {
        try {
          const response = await fetch(getApiUrl(`api/users/sessions/${sessionId}`), {
            method: 'DELETE'
          });

          if (!response.ok) {
            throw new Error('Failed to revoke session');
          }

          setSessions(prev => prev.filter(s => s.id !== sessionId));
          toast.success('Session revoked successfully');
        } catch (error) {
          console.error('Error revoking session:', error);
          toast.error('Failed to revoke session');
        }
      }
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 5) return 'Active Now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getDeviceIcon = (deviceName) => {
    if (deviceName.includes('Windows') || deviceName.includes('Mac') || deviceName.includes('Linux')) {
      return '💻';
    }
    if (deviceName.includes('Android') || deviceName.includes('iOS')) {
      return '📱';
    }
    return '🖥️';
  };

  const getLocationFromIP = (ip) => {
    // Simple IP location mock - in production, use a real geolocation service
    if (ip?.includes('::1') || ip?.includes('127.0.0.1')) {
      return 'Localhost';
    }
    return 'Unknown Location';
  };

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-cyan-900 to-teal-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl h-[90vh] backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/20 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/10 rounded-full transition"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Public Profile Section */}
          <div className="backdrop-blur-md bg-white/5 rounded-2xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6">Public Profile</h2>
            
            {/* Avatar */}
            <div className="flex items-center gap-6 mb-6">
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleAvatarSelect}
                  style={{ display: 'none' }}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-32 h-32 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-4xl font-bold cursor-pointer hover:opacity-80 transition overflow-hidden"
                >
                  {uploading ? (
                    <div className="animate-pulse">...</div>
                  ) : avatarUrl ? (
                    <img src={getAssetUrl(avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    user?.username?.charAt(0).toUpperCase()
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 p-2 bg-cyan-600 hover:bg-cyan-700 rounded-full text-white shadow-lg transition disabled:opacity-50"
                  title="Change avatar"
                >
                  <Camera size={20} />
                </button>
                {avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={uploading}
                    className="absolute top-0 right-0 p-2 bg-red-600 hover:bg-red-700 rounded-full text-white shadow-lg transition disabled:opacity-50"
                    title="Remove avatar"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">{user?.username}</h3>
                <p className="text-sm text-gray-300">{user?.email}</p>
                <p className="text-xs text-gray-400 mt-1">Click the avatar to change your profile picture</p>
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself..."
                maxLength={150}
                rows={3}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{bio.length}/150 characters</span>
                <button
                  onClick={handleSaveBio}
                  disabled={saving}
                  className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Bio'}
                </button>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="backdrop-blur-md bg-white/5 rounded-2xl p-6 border border-white/10">
            <h2 className="text-xl font-semibold text-white mb-6">🔐 Security Dashboard</h2>
            
            <div className="mb-4">
              <h3 className="text-lg font-medium text-white mb-2">Active Sessions</h3>
              <p className="text-sm text-gray-300 mb-4">
                Manage devices where you're currently logged in. Revoke access from any device you don't recognize.
              </p>
            </div>

            {loading ? (
              <div className="text-center text-gray-300 py-8">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="text-center text-gray-400 py-8">No active sessions found</div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="backdrop-blur-sm bg-white/5 rounded-xl p-4 border border-white/10 flex items-start justify-between hover:bg-white/10 transition"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div className="text-3xl">{getDeviceIcon(session.device_name)}</div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white">{session.device_name}</h4>
                        <p className="text-sm text-gray-300 mt-1">
                          {getLocationFromIP(session.ip_address)} • {session.ip_address}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(session.last_active)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition flex items-center gap-2 text-sm"
                    >
                      <Trash2 size={16} />
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant="danger"
      />
    </div>
  );
}

export default Settings;
