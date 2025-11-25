import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MessageCircle, Users, UserPlus, Settings } from 'lucide-react';
import { io } from 'socket.io-client';
import { ToastContext } from '../App';
import PeopleView from './PeopleView';
import RequestsView from './RequestsView';
import ChatWindow from './ChatWindow';

function Chat() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const toast = useContext(ToastContext);

  // Helper to handle both Base64 and legacy file paths
  const getAvatarUrl = (avatarUrl) => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('data:')) return avatarUrl; // Base64 Data URI
    return `http://localhost:3000${avatarUrl}`; // Legacy file path
  };
  const [activeView, setActiveView] = useState('chats'); // 'chats', 'people', 'requests'
  const [requestCount, setRequestCount] = useState(0);
  const [socket, setSocket] = useState(null);
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(() => {
    // Try to restore selected friend from localStorage
    const savedFriend = localStorage.getItem('selectedFriend');
    return savedFriend ? JSON.parse(savedFriend) : null;
  });
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    // Connect to Socket.io with cleanup function (prevents double connections in React StrictMode)
    const newSocket = io('http://localhost:3000', {
      auth: {
        userId: user.id
      }
    });
    setSocket(newSocket);

    // Register user with socket
    newSocket.emit('register', user.id);

    // Listen for new friend requests
    newSocket.on('new_friend_request', (data) => {
      if (data.receiverId === user.id) {
        setRequestCount(prev => prev + 1);
        // Show notification
        toast.info(`New friend request from ${data.sender.username}!`);
      }
    });

    // Listen for accepted requests
    newSocket.on('request_accepted', (data) => {
      if (data.senderId === user.id) {
        toast.success('Your friend request was accepted!');
        fetchFriends(); // Refresh friends list
      }
    });

    // Listen for user status changes to update friends list
    newSocket.on('user_status_change', (data) => {
      setFriends(prevFriends => 
        prevFriends.map(friend => 
          friend.id === data.userId 
            ? { ...friend, is_online: data.isOnline ? 1 : 0, last_seen: data.isOnline ? null : new Date().toISOString() }
            : friend
        )
      );
    });

    // Listen for messages being read (to clear unread badge)
    newSocket.on('messages_read', (data) => {
      // Clear unread count when messages are marked as read
      // This happens when: 
      // 1. User opens a chat (receiverId = friend, senderId = current user)
      // 2. Friend opens chat with us (senderId = friend, receiverId = current user)
      if (data.senderId === user.id) {
        // We read someone's messages - clear their badge
        setFriends(prevFriends =>
          prevFriends.map(friend =>
            friend.id === data.receiverId ? { ...friend, unreadCount: 0 } : friend
          )
        );
      }
    });

    // Fetch initial data
    fetchRequestCount();
    fetchFriends();

    // CRITICAL: Cleanup function to disconnect socket
    return () => {
      newSocket.disconnect();
    };
  }, [user.id]);

  // Separate effect for receive_message to have access to current selectedFriend
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (data) => {
      // Only increment unread count if the message is NOT from the currently open chat
      if (!selectedFriend || data.sender_id !== selectedFriend.id) {
        setFriends(prevFriends =>
          prevFriends.map(friend =>
            friend.id === data.sender_id
              ? { ...friend, unreadCount: (friend.unreadCount || 0) + 1 }
              : friend
          )
        );
      }
      // If the chat is open, messages will be auto-marked as read by ChatWindow component
    };

    socket.on('receive_message', handleReceiveMessage);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
    };
  }, [socket, selectedFriend]);

  // Resizable sidebar handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX - (window.innerWidth - window.innerWidth + 16); // Account for padding
      if (newWidth >= 250 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  const fetchRequestCount = async () => {
    try {
      const response = await fetch(`http://localhost:3000/api/friends/requests/${user.id}`);
      const data = await response.json();
      setRequestCount(data.length);
    } catch (error) {
      console.error('Error fetching request count:', error);
    }
  };

  const fetchFriends = async () => {
    try {
      const response = await fetch(`http://localhost:3000/api/friends/list/${user.id}`);
      const data = await response.json();
      
      // Check if data is an array, if not set empty array
      if (Array.isArray(data)) {
        setFriends(data);
        
        // Update selectedFriend if it exists in the new friends list
        if (selectedFriend) {
          const updatedFriend = data.find(f => f.id === selectedFriend.id);
          if (updatedFriend) {
            setSelectedFriend(updatedFriend);
            localStorage.setItem('selectedFriend', JSON.stringify(updatedFriend));
          }
        }
      } else {
        console.error('Friends API returned non-array:', data);
        setFriends([]);
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
      setFriends([]);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('selectedFriend');
    if (socket) {
      socket.disconnect();
    }
    navigate('/login');
  };

  const handleSelectFriend = (friend) => {
    setSelectedFriend(friend);
    setActiveView('chats');
    // Save to localStorage for persistence across refreshes
    localStorage.setItem('selectedFriend', JSON.stringify(friend));
    // Don't reset unread count here - let it reset when messages are actually marked as read
    // This ensures the badge disappears only after the messages are truly seen
  };

  const getInitials = (username) => {
    return username.charAt(0).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 flex items-center justify-center p-4">
      {/* Glassmorphism Container */}
      <div className="flex w-full max-w-7xl h-[calc(100vh-2rem)] bg-white/80 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden">
        {/* Sidebar */}
        <div 
          className={`${selectedFriend ? 'hidden lg:flex' : 'flex'} bg-white/50 flex-col border-r border-gray-200/50`}
          style={{ 
            width: window.innerWidth >= 1024 ? `${sidebarWidth}px` : '100%', 
            minWidth: '250px', 
            maxWidth: '600px' 
          }}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200/50 bg-white/30">
            <h1 className="text-3xl font-extrabold text-cyan-700 tracking-tight mb-3">Connect</h1>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-teal-600 text-white flex items-center justify-center font-bold shadow-md overflow-hidden">
                  {user.avatar_url ? (
                    <img src={getAvatarUrl(user.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    user?.username?.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="text-sm text-gray-700 font-medium">
                  {user?.username}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/settings')}
                  className="flex items-center gap-1.5 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-xl transition-all text-sm font-medium"
                  title="Settings"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-all text-sm font-medium"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200/50 bg-white/30">
            <button
              onClick={() => {
                setActiveView('chats');
                setSelectedFriend(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition-all ${
                activeView === 'chats'
                  ? 'text-cyan-700 border-b-2 border-cyan-700 bg-white/40'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/20'
              }`}
            >
              <MessageCircle size={18} />
              Chats
            </button>
            <button
              onClick={() => setActiveView('people')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition-all ${
                activeView === 'people'
                  ? 'text-cyan-700 border-b-2 border-cyan-700 bg-white/40'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/20'
              }`}
            >
              <Users size={18} />
              People
            </button>
            <button
              onClick={() => {
                setActiveView('requests');
                fetchRequestCount(); // Refresh count when opened
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition-all relative ${
                activeView === 'requests'
                  ? 'text-cyan-700 border-b-2 border-cyan-700 bg-white/40'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/20'
              }`}
            >
              <UserPlus size={18} />
              Requests
              {requestCount > 0 && (
                <span className="absolute top-1 right-8 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-md">
                  {requestCount}
                </span>
              )}
            </button>
          </div>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto">
          {activeView === 'chats' && (
            friends.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <MessageCircle size={48} className="mx-auto mb-4 text-gray-300" />
                <p className="font-medium">No friends yet</p>
                <p className="text-sm mt-2">Add friends to start chatting!</p>
              </div>
            ) : (
              <div className="divide-y">
                {[...friends]
                  .sort((a, b) => {
                    // Primary: Online status (online users first)
                    if (a.is_online !== b.is_online) {
                      return b.is_online - a.is_online;
                    }
                    // Secondary: Unread count (users with unread messages first)
                    const aUnread = a.unreadCount || 0;
                    const bUnread = b.unreadCount || 0;
                    if (aUnread !== bUnread) {
                      return bUnread - aUnread;
                    }
                    // Tertiary: Alphabetical order
                    return a.username.localeCompare(b.username);
                  })
                  .map((friend) => {
                  const isActive = selectedFriend?.id === friend.id;
                  return (
                    <button
                      key={friend.id}
                      onClick={() => handleSelectFriend(friend)}
                      className={`w-full p-4 flex items-center gap-4 transition-all text-left relative group ${
                        isActive 
                          ? 'bg-cyan-50 hover:bg-cyan-100' 
                          : 'hover:bg-white/60'
                      }`}
                    >
                      {/* Active Indicator */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-cyan-700 rounded-r-full transition-transform origin-center ${
                        isActive ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-100'
                      }`}></div>
                      <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-cyan-600 to-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-md overflow-hidden">
                        {friend.avatar_url ? (
                          <img src={getAvatarUrl(friend.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          getInitials(friend.username)
                        )}
                        {friend.is_online && (
                          <div className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{friend.username}</p>
                        <p className={`text-sm ${friend.is_online ? 'text-green-600' : 'text-gray-500'}`}>
                          {friend.is_online ? 'Online' : 'Offline'}
                        </p>
                      </div>
                      {friend.unreadCount > 0 && (
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 bg-green-500 text-white text-xs font-bold rounded-full shadow-md">
                            {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}
          {activeView === 'people' && <PeopleView user={user} onSelectFriend={handleSelectFriend} />}
          {activeView === 'requests' && (
            <RequestsView 
              user={user} 
              onRequestHandled={() => {
                fetchRequestCount();
                fetchFriends();
              }} 
            />
          )}
        </div>
      </div>

      {/* Resize Handle */}
      <div 
        className={`hidden lg:block w-1 hover:w-1 cursor-col-resize transition-colors ${
          isResizing ? 'bg-cyan-500' : 'bg-transparent hover:bg-cyan-500'
        }`}
        onMouseDown={handleMouseDown}
        style={{ userSelect: 'none' }}
      />

      {/* Main Content Area */}
      {selectedFriend ? (
        <ChatWindow 
          friend={selectedFriend} 
          user={user} 
          socket={socket}
          onBack={() => {
            setSelectedFriend(null);
            localStorage.removeItem('selectedFriend');
          }}
        />
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-gray-50/50 to-white/50">
          <div className="text-center px-8">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-cyan-100 to-teal-100 flex items-center justify-center">
              <MessageCircle size={48} className="text-cyan-700" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-3">Welcome to Connect</h2>
            <p className="text-gray-600 text-lg">Select a chat or add friends to get started</p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default Chat;
