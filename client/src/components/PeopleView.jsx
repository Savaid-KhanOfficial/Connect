import { useState, useContext } from 'react';
import { Search, UserPlus, X, MessageCircle } from 'lucide-react';
import { ToastContext } from '../App';

function PeopleView({ user, onSelectFriend }) {
  const toast = useContext(ToastContext);
  
  // Helper to handle both Base64 and legacy file paths
  const getAvatarUrl = (avatarUrl) => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('data:')) return avatarUrl;
    return `http://localhost:3000${avatarUrl}`;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `http://localhost:3000/api/friends/search?query=${encodeURIComponent(searchQuery)}&userId=${user.id}`
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Search failed');
        return;
      }

      setSearchResults(data);
    } catch (err) {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const openAddFriendModal = (userToAdd) => {
    setSelectedUser(userToAdd);
    setNote('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUser(null);
    setNote('');
  };

  const sendFriendRequest = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch('http://localhost:3000/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          senderId: user.id,
          receiverId: selectedUser.id,
          note: note.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to send request');
        return;
      }

      toast.success('Friend request sent!');
      closeModal();
      
      // Remove user from search results
      setSearchResults(prev => prev.filter(u => u.id !== selectedUser.id));
    } catch (err) {
      toast.error('Unable to connect to server');
    }
  };

  const getInitials = (username) => {
    return username.charAt(0).toUpperCase();
  };

  return (
    <div className="p-4">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for users..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        {error && (
          <p className="text-red-500 text-sm mt-2">{error}</p>
        )}
      </form>

      {/* Search Results */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2">Searching...</p>
        </div>
      ) : searchResults.length > 0 ? (
        <div className="space-y-2">
          {searchResults.map((foundUser) => (
            <div
              key={foundUser.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold overflow-hidden">
                  {foundUser.avatar_url ? (
                    <img src={getAvatarUrl(foundUser.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(foundUser.username)
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{foundUser.username}</p>
                  <p className="text-sm text-gray-500">{foundUser.email}</p>
                </div>
              </div>
              {foundUser.is_friend ? (
                <button
                  onClick={() => onSelectFriend && onSelectFriend(foundUser)}
                  className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
                >
                  <MessageCircle size={16} />
                  Message
                </button>
              ) : (
                <button
                  onClick={() => openAddFriendModal(foundUser)}
                  className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm transition"
                >
                  <UserPlus size={16} />
                  Add
                </button>
              )}
            </div>
          ))}
        </div>
      ) : searchQuery && !loading ? (
        <div className="text-center py-8 text-gray-500">
          <p>No users found</p>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <Search size={48} className="mx-auto mb-2 opacity-50" />
          <p>Search for people to connect with</p>
        </div>
      )}

      {/* Add Friend Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">Send Friend Request</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold text-lg overflow-hidden">
                  {selectedUser.avatar_url ? (
                    <img src={getAvatarUrl(selectedUser.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(selectedUser.username)
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{selectedUser.username}</p>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add a note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Hi! Let's connect..."
                rows={3}
                maxLength={200}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">{note.length}/200 characters</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={sendFriendRequest}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PeopleView;

