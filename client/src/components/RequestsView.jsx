import { useState, useEffect, useContext } from 'react';
import { UserPlus, Check, X } from 'lucide-react';
import { ToastContext } from '../App';

function RequestsView({ user, onRequestHandled }) {
  const toast = useContext(ToastContext);
  
  // Helper to handle both Base64 and legacy file paths
  const getAvatarUrl = (avatarUrl) => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('data:')) return avatarUrl;
    return `http://localhost:3000${avatarUrl}`;
  };

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, [user.id]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3000/api/friends/requests/${user.id}`);
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requestId) => {
    try {
      const response = await fetch('http://localhost:3000/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId,
          userId: user.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to accept request');
        return;
      }

      toast.success('Friend request accepted!');
      
      // Remove from list
      setRequests(prev => prev.filter(req => req.id !== requestId));
      
      // Update badge count
      if (onRequestHandled) {
        onRequestHandled();
      }
    } catch (err) {
      toast.error('Unable to connect to server');
    }
  };

  const handleReject = async (requestId) => {
    try {
      const response = await fetch('http://localhost:3000/api/friends/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to reject request');
        return;
      }

      // Remove from list
      setRequests(prev => prev.filter(req => req.id !== requestId));
      
      // Update badge count
      if (onRequestHandled) {
        onRequestHandled();
      }
    } catch (err) {
      toast.error('Unable to connect to server');
    }
  };

  const getInitials = (username) => {
    return username.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2">Loading requests...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <UserPlus size={48} className="mx-auto mb-2 opacity-50" />
        <p>No pending friend requests</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {requests.map((request) => (
        <div
          key={request.id}
          className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold text-lg flex-shrink-0 overflow-hidden">
              {request.avatar_url ? (
                <img src={getAvatarUrl(request.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                getInitials(request.username)
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-800">{request.username}</p>
              <p className="text-sm text-gray-500">{request.email}</p>
              {request.note && (
                <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
                  <p className="text-sm text-gray-700 italic">"{request.note}"</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleAccept(request.id)}
              className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition font-medium"
            >
              <Check size={18} />
              Accept
            </button>
            <button
              onClick={() => handleReject(request.id)}
              className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition font-medium"
            >
              <X size={18} />
              Decline
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            Sent {new Date(request.created_at).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

export default RequestsView;
