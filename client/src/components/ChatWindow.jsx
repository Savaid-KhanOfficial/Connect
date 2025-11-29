import { useState, useEffect, useRef, useContext } from 'react';
import { Send, Check, CheckCheck, ArrowLeft, MoreVertical, Edit2, Ban, X, Ghost, Lock, Smile, Reply, Paperclip, Trash2, ChevronDown, Mic } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { ToastContext } from '../App';
import { deriveSharedSecret, encryptMessage, decryptMessage } from '../utils/crypto';
import ConfirmDialog from './ConfirmDialog';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { getApiUrl, getAssetUrl } from '../config/api';

function ChatWindow({ friend, user, socket, onBack }) {
  const toast = useContext(ToastContext);
  
  // Use imported getAssetUrl helper
  const getAvatarUrl = getAssetUrl;

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [friendStatus, setFriendStatus] = useState({ 
    isOnline: friend?.is_online === 1, 
    lastSeen: friend?.last_seen 
  });
  const [loading, setLoading] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editedContent, setEditedContent] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [blockStatus, setBlockStatus] = useState({ isBlocked: false, blockerId: null });
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [sharedSecret, setSharedSecret] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  
  // Audio recording hook
  const {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
    formatTime
  } = useAudioRecorder();
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });

  useEffect(() => {
    // Derive shared secret for E2EE
    const myPrivateKey = localStorage.getItem('chat_private_key');
    const myPublicKey = localStorage.getItem('chat_public_key');
    
    console.log('[E2EE] Initializing encryption:', {
      userId: user.id,
      username: user.username,
      myPublicKey: myPublicKey?.substring(0, 20) + '...',
      friendId: friend.id,
      friendUsername: friend.username,
      friendPublicKey: friend.public_key?.substring(0, 20) + '...',
      hasPrivateKey: !!myPrivateKey,
      privateKeyLength: myPrivateKey?.length,
      hasFriendPublicKey: !!friend.public_key,
      friendPublicKeyLength: friend.public_key?.length
    });
    
    if (myPrivateKey && friend.public_key) {
      const secret = deriveSharedSecret(myPrivateKey, friend.public_key);
      console.log('[E2EE] Shared secret derived:', {
        success: !!secret,
        secret: secret?.substring(0, 16) + '...',
        secretLength: secret?.length,
        friendId: friend.id
      });
      setSharedSecret(secret);
    } else {
      console.warn('[E2EE] Cannot derive shared secret - missing keys:', {
        hasPrivateKey: !!myPrivateKey,
        hasFriendPublicKey: !!friend.public_key
      });
    }

    // Fetch chat history
    fetchMessages();
    
    // Don't fetch status on mount - use friend prop which has latest status from friends list
    // Status updates will come via socket events

    // Fetch block status
    fetchBlockStatus();

    // Mark messages as read when opening chat
    markMessagesAsRead();

    // Listen for incoming messages
    if (socket) {
      socket.on('receive_message', handleReceiveMessage);
      socket.on('message_delivered', handleMessageDelivered);
      socket.on('messages_read', handleMessagesRead);
      socket.on('user_status_change', handleStatusChange);
      socket.on('message_updated', handleMessageUpdated);
      socket.on('user_blocked', handleUserBlocked);
      socket.on('user_unblocked', handleUserUnblocked);
      socket.on('message_expired', handleMessageExpired);
      socket.on('message_deleted', handleMessageDeleted);
    }

    return () => {
      if (socket) {
        socket.off('receive_message', handleReceiveMessage);
        socket.off('message_delivered', handleMessageDelivered);
        socket.off('messages_read', handleMessagesRead);
        socket.off('user_status_change', handleStatusChange);
        socket.off('message_updated', handleMessageUpdated);
        socket.off('user_blocked', handleUserBlocked);
        socket.off('user_unblocked', handleUserUnblocked);
        socket.off('message_expired', handleMessageExpired);
        socket.off('message_deleted', handleMessageDeleted);
      }
    };
  }, [friend.id, socket, sharedSecret]); // Added sharedSecret to dependencies

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    scrollToBottom();
  }, [messages]);

  // Click outside to close dropdown menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
    };

    if (activeMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuId]);

  const toggleMenu = (messageId) => {
    setActiveMenuId(activeMenuId === messageId ? null : messageId);
  };

  const fetchMessages = async () => {
    try {
      const response = await fetch(getApiUrl(`api/messages/${user.id}/${friend.id}`));
      const data = await response.json();
      
      // Decrypt messages if we have a shared secret
      const myPrivateKey = localStorage.getItem('chat_private_key');
      if (myPrivateKey && friend.public_key) {
        const secret = deriveSharedSecret(myPrivateKey, friend.public_key);
        if (secret) {
          const decryptedMessages = data.map(msg => {
            if (msg.is_deleted === 1) {
              return msg; // Don't decrypt deleted messages
            }
            
            // Don't decrypt media files (image, file, audio) - they're not encrypted
            if (msg.type === 'image' || msg.type === 'file' || msg.type === 'audio') {
              return msg;
            }
            
            // Decrypt text messages only
            const decrypted = decryptMessage(msg.message, secret);
            
            if (!decrypted) {
              console.warn(`[E2EE] Failed to decrypt message ${msg.id}:`, {
                messagePreview: msg.message?.substring(0, 50),
                type: msg.type,
                created_at: msg.created_at,
                sender_id: msg.sender_id,
                secretUsed: secret?.substring(0, 16) + '...'
              });
              // Return original encrypted message as fallback
              return msg;
            }
            
            console.log(`[E2EE] Successfully decrypted message ${msg.id}`);
            return {
              ...msg,
              message: decrypted
            };
          });
          setMessages(decryptedMessages);
        } else {
          console.error('[E2EE] Failed to derive shared secret');
          setMessages(data);
        }
      } else {
        console.warn('[E2EE] Missing private key or friend public key');
        setMessages(data);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriendStatus = async () => {
    try {
      const response = await fetch(getApiUrl(`api/messages/user-status/${friend.id}`));
      const data = await response.json();
      setFriendStatus({
        isOnline: data.is_online === 1,
        lastSeen: data.last_seen
      });
    } catch (error) {
      console.error('Error fetching friend status:', error);
    }
  };

  const fetchBlockStatus = async () => {
    try {
      const response = await fetch(getApiUrl(`api/friends/block-status/${user.id}/${friend.id}`));
      const data = await response.json();
      setBlockStatus(data);
    } catch (error) {
      console.error('Error fetching block status:', error);
    }
  };

  const markMessagesAsRead = () => {
    if (socket) {
      socket.emit('mark_messages_read', {
        userId: user.id,
        friendId: friend.id
      });
    }
  };

  const handleReceiveMessage = (messageData) => {
    console.log('[E2EE] Received message via socket:', {
      messageId: messageData.id,
      senderId: messageData.sender_id,
      receiverId: messageData.receiver_id,
      type: messageData.type,
      encryptedPreview: messageData.message?.substring(0, 30) + '...',
      hasSharedSecret: !!sharedSecret,
      secretPreview: sharedSecret?.substring(0, 16) + '...'
    });
    
    // Only add message if it's from the current friend
    if (messageData.sender_id === friend.id || messageData.receiver_id === friend.id) {
      // Decrypt the message if we have a shared secret
      if (sharedSecret && messageData.is_deleted !== 1) {
        const decrypted = decryptMessage(messageData.message, sharedSecret);
        
        if (!decrypted) {
          console.error(`[E2EE] Failed to decrypt incoming message ${messageData.id}:`, {
            messagePreview: messageData.message?.substring(0, 50),
            type: messageData.type,
            hasSecret: !!sharedSecret,
            secretLength: sharedSecret?.length
          });
        } else {
          console.log(`[E2EE] Successfully decrypted incoming message ${messageData.id}:`, {
            decryptedPreview: decrypted.substring(0, 30)
          });
        }
        
        messageData.message = decrypted || messageData.message; // Fallback to original if decryption fails
      } else {
        console.warn('[E2EE] Not decrypting message:', {
          hasSecret: !!sharedSecret,
          isDeleted: messageData.is_deleted === 1
        });
      }
      
      setMessages(prev => [...prev, messageData]);
      
      // Mark as read immediately if chat is open
      if (messageData.sender_id === friend.id) {
        setTimeout(() => markMessagesAsRead(), 500);
      }
    }
  };

  const handleMessageDelivered = (data) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === data.messageId ? { ...msg, status: 'delivered' } : msg
      )
    );
  };

  const handleMessagesRead = (data) => {
    if (data.receiverId === friend.id) {
      setMessages(prev =>
        prev.map(msg =>
          msg.sender_id === user.id && msg.receiver_id === friend.id
            ? { ...msg, status: 'read' }
            : msg
        )
      );
    }
  };

  const handleStatusChange = (data) => {
    console.log('Status change received:', data, 'Friend ID:', friend.id);
    if (data.userId === friend.id) {
      setFriendStatus({
        isOnline: data.isOnline,
        lastSeen: data.isOnline ? null : new Date().toISOString()
      });
    }
  };

  const handleMessageUpdated = (data) => {
    console.log('Message updated event received:', data);
    console.log('Current user:', user.id, 'Friend:', friend.id);
    console.log('Current messages:', messages);
    
    // Update message if it's in this conversation
    if ((data.sender_id === user.id && data.receiver_id === friend.id) ||
        (data.sender_id === friend.id && data.receiver_id === user.id)) {
      setMessages(prev => {
        const updated = prev.map(msg =>
          msg.id === data.id
            ? { ...msg, message: data.message, is_edited: 1 }
            : msg
        );
        console.log('Updated messages:', updated);
        return updated;
      });
    }
  };

  const handleUserBlocked = (data) => {
    if ((data.blockerId === user.id && data.blockedId === friend.id) ||
        (data.blockerId === friend.id && data.blockedId === user.id)) {
      fetchBlockStatus();
    }
  };

  const handleUserUnblocked = (data) => {
    if ((data.blockerId === user.id && data.blockedId === friend.id) ||
        (data.blockerId === friend.id && data.blockedId === user.id)) {
      fetchBlockStatus();
    }
  };

  const handleMessageExpired = (data) => {
    setMessages(prev => prev.map(msg => 
      msg.id === data.messageId 
        ? { ...msg, message: 'Message expired', is_deleted: 1 }
        : msg
    ));
  };

  const handleMessageDeleted = (data) => {
    console.log('[DELETE] Message deleted event received:', data);
    console.log('[DELETE] Current user:', user.id, 'Friend:', friend.id);
    
    // Update message in real-time when deleted for everyone
    // Convert id to number for comparison since it might come as string
    const messageId = typeof data.id === 'string' ? parseInt(data.id) : data.id;
    
    setMessages(prev => {
      const updated = prev.map(msg =>
        msg.id === messageId
          ? { ...msg, message: 'This message was deleted', is_deleted: 1 }
          : msg
      );
      console.log('[DELETE] Messages updated:', updated.find(m => m.id === messageId));
      return updated;
    });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;

    const plaintext = newMessage.trim();
    let messageToSend = plaintext;

    // Encrypt the message if we have a shared secret
    if (sharedSecret) {
      const encrypted = encryptMessage(plaintext, sharedSecret);
      if (encrypted) {
        messageToSend = encrypted;
        console.log('[E2EE] Message encrypted successfully:', {
          plaintextLength: plaintext.length,
          encryptedLength: messageToSend.length,
          secretLength: sharedSecret.length
        });
      } else {
        console.error('[E2EE] Encryption failed, sending plaintext');
      }
    } else {
      console.warn('[E2EE] No shared secret, sending plaintext');
      console.warn('No shared secret available, sending unencrypted message');
    }

    const messageData = {
      sender_id: user.id,
      receiver_id: friend.id,
      message: messageToSend,
      isDisappearing: isGhostMode,
      replyToId: replyingTo?.id || null
    };

    // Optimistically add message to UI (with plaintext)
    const tempMessage = {
      id: Date.now(),
      sender_id: user.id,
      receiver_id: friend.id,
      message: plaintext, // Show plaintext in UI
      status: 'sent',
      is_deleted: 0,
      is_disappearing: isGhostMode ? 1 : 0,
      reply_to_id: replyingTo?.id || null,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    setReplyingTo(null); // Clear reply after sending
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Send via socket
    socket.emit('send_message', messageData, (response) => {
      if (response.success) {
        // Update temp message with real ID
        setMessages(prev =>
          prev.map(msg =>
            msg.id === tempMessage.id ? { ...msg, id: response.messageId } : msg
          )
        );
      } else {
        toast.error('Failed to send message');
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      }
    });
  };

  const startEditMessage = (message) => {
    // Prevent editing file/image messages
    if (message.type === 'image' || message.type === 'file') {
      toast.error('You cannot edit image or file messages');
      setActiveMenuId(null);
      return;
    }
    
    setEditingMessageId(message.id);
    setEditedContent(message.message);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditedContent('');
  };

  const saveEdit = async (messageId) => {
    if (!editedContent.trim()) {
      toast.warning('Message cannot be empty');
      return;
    }

    console.log('Saving edit for message:', messageId);
    console.log('New content:', editedContent.trim());
    console.log('User ID:', user.id);

    try {
      const response = await fetch(getApiUrl(`api/messages/edit/${messageId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          newContent: editedContent.trim()
        })
      });

      const data = await response.json();
      console.log('Server response:', response.status, data);

      if (!response.ok) {
        console.error('Edit error:', data);
        toast.error(data.error || 'Failed to edit message');
        return;
      }

      console.log('Message edited successfully:', data);
      cancelEdit();
    } catch (error) {
      console.error('Network error:', error);
      toast.error('Error editing message');
    }
  };

  const handleBlockUser = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Block User',
      message: `Are you sure you want to block ${friend.username}? You will no longer receive messages from this user.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const response = await fetch(getApiUrl('api/friends/block'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              blockerId: user.id,
              blockedId: friend.id
            })
          });

          if (!response.ok) {
            const data = await response.json();
            toast.error(data.error || 'Failed to block user');
            return;
          }

          setShowMenu(false);
          fetchBlockStatus();
        } catch (error) {
          toast.error('Unable to connect to server');
        }
      }
    });
  };

  const handleUnblockUser = async () => {
    try {
      const response = await fetch(getApiUrl('api/friends/unblock'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blockerId: user.id,
          blockedId: friend.id
        })
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || 'Failed to unblock user');
        return;
      }

      fetchBlockStatus();
    } catch (error) {
      toast.error('Unable to connect to server');
    }
  };

  const handleDeleteMessage = async (mode) => {
    if (!deletingMessageId) return;

    try {
      const response = await fetch(getApiUrl(`api/messages/delete/${deletingMessageId}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          mode: mode // 'everyone' or 'me'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete message');
        return;
      }

      if (mode === 'me') {
        // Remove from local state immediately
        setMessages(prev => prev.filter(msg => msg.id !== deletingMessageId));
      } else if (mode === 'everyone') {
        // Update local state immediately to show "This message was deleted"
        setMessages(prev => prev.map(msg =>
          msg.id === deletingMessageId
            ? { ...msg, message: 'This message was deleted', is_deleted: 1 }
            : msg
        ));
      }

      setShowDeleteModal(false);
      setDeletingMessageId(null);
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleClearChat = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Clear Chat',
      message: 'Are you sure you want to clear this chat? This will hide all messages for you only. This action cannot be undone.',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const response = await fetch(getApiUrl(`api/messages/clear/${friend.id}`), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: user.id
            })
          });

          if (!response.ok) {
            const data = await response.json();
            toast.error(data.error || 'Failed to clear chat');
            return;
          }

          // Clear messages from UI
          setMessages([]);
          toast.success('Chat cleared successfully');
        } catch (error) {
          console.error('Error clearing chat:', error);
          toast.error('Failed to clear chat');
        }
      }
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const autoResizeTextarea = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  };

  const handleReply = (msg) => {
    setReplyingTo(msg);
    textareaRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji);
    textareaRef.current?.focus();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, and PDF files are allowed');
      e.target.value = ''; // Reset input
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      e.target.value = ''; // Reset input
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', file);

      // Create XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      // Handle response
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
      });

      xhr.open('POST', getApiUrl('api/upload'));
      xhr.send(formData);

      const { url, type, filename, size } = await uploadPromise;

      // Don't encrypt file URLs - they need to be accessible
      // Store file metadata as JSON for file type messages
      let messageToSend = url;
      if (type === 'file') {
        messageToSend = JSON.stringify({
          url,
          filename: file.name,
          size
        });
      }

      // Optimistically add message to UI
      const tempMessage = {
        id: Date.now(),
        sender_id: user.id,
        receiver_id: friend.id,
        message: messageToSend,
        type: type,
        status: 'sent',
        is_deleted: 0,
        is_disappearing: 0,
        reply_to_id: replyingTo?.id || null,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, tempMessage]);
      setReplyingTo(null);

      // Send message with file URL
      const messageData = {
        sender_id: user.id,
        receiver_id: friend.id,
        message: messageToSend,
        type: type,
        replyToId: replyingTo?.id || null,
        isDisappearing: false // Files cannot be disappearing
      };

      socket.emit('send_message', messageData, (response) => {
        if (response.success) {
          // Update temp message with real ID
          setMessages(prev =>
            prev.map(msg =>
              msg.id === tempMessage.id ? { ...msg, id: response.messageId } : msg
            )
          );
          setUploadProgress(0);
          toast.success(`${type === 'image' ? 'Image' : 'File'} sent successfully`);
        } else {
          toast.error(response.error || 'Failed to send file');
          // Remove temp message on error
          setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
        }
      });

      // Reset file input
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
      e.target.value = ''; // Reset input on error
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const scrollToMessage = (messageId) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageElement.classList.add('highlight-message');
      setTimeout(() => {
        messageElement.classList.remove('highlight-message');
      }, 2000);
    }
  };

  const getInitials = (username) => {
    return username.charAt(0).toUpperCase();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getReplyPreviewText = (message) => {
    if (message.type === 'image') return '📷 Image';
    if (message.type === 'audio') return '🎤 Voice message';
    if (message.type === 'file') {
      try {
        const fileData = JSON.parse(message.message);
        return `📎 ${fileData.filename}`;
      } catch {
        return '📎 File';
      }
    }
    return message.message;
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
      setShowEmojiPicker(false);
    } catch (error) {
      console.error('[AUDIO] Error starting recording:', error);
      toast.error('Failed to access microphone. Please allow microphone permission.');
    }
  };

  const handleSendAudio = async () => {
    try {
      setUploading(true);
      const audioBlob = await stopRecording();
      
      // Create File object from blob
      const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      // Upload using XMLHttpRequest for progress tracking
      const formData = new FormData();
      formData.append('file', audioFile);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
        }
      });

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
      });

      xhr.open('POST', getApiUrl('api/upload'));
      xhr.send(formData);

      const { url, type } = await uploadPromise;

      // Optimistically add message to UI
      const tempMessage = {
        id: Date.now(),
        sender_id: user.id,
        receiver_id: friend.id,
        message: url,
        type: type,
        status: 'sent',
        is_deleted: 0,
        is_disappearing: 0,
        reply_to_id: replyingTo?.id || null,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, tempMessage]);
      setReplyingTo(null);

      // Send message with audio URL (no encryption for media)
      const messageData = {
        sender_id: user.id,
        receiver_id: friend.id,
        message: url,
        type: type,
        replyToId: replyingTo?.id || null,
        isDisappearing: false
      };

      socket.emit('send_message', messageData, (response) => {
        if (response.success) {
          // Update temp message with real ID
          setMessages(prev =>
            prev.map(msg =>
              msg.id === tempMessage.id ? { ...msg, id: response.messageId } : msg
            )
          );
          setUploadProgress(0);
          toast.success('Voice message sent successfully');
        } else {
          toast.error(response.error || 'Failed to send voice message');
          // Remove temp message on error
          setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
        }
      });
    } catch (error) {
      console.error('[AUDIO] Error sending audio:', error);
      toast.error(error.message || 'Failed to send voice message');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
  };

  const getLastSeenText = () => {
    if (friendStatus.isOnline) {
      return <span className="text-green-500">Online</span>;
    }
    
    if (!friendStatus.lastSeen) {
      return <span className="text-gray-400">Offline</span>;
    }

    const lastSeen = new Date(friendStatus.lastSeen);
    const now = new Date();
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return <span className="text-gray-400">Last seen just now</span>;
    if (diffMins < 60) return <span className="text-gray-400">Last seen {diffMins}m ago</span>;
    if (diffHours < 24) return <span className="text-gray-400">Last seen {diffHours}h ago</span>;
    return <span className="text-gray-400">Last seen {diffDays}d ago</span>;
  };

  const renderMessageStatus = (message) => {
    if (message.sender_id !== user.id) return null;

    if (message.status === 'read') {
      return <CheckCheck size={16} className="text-blue-500" />;
    } else if (message.status === 'delivered') {
      return <CheckCheck size={16} className="text-gray-400" />;
    } else {
      return <Check size={16} className="text-gray-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white/50">
      {/* Header */}
      <div className="relative p-5 border-b border-gray-200/50 flex items-center gap-4 bg-white/90 backdrop-blur z-50">
        <button
          onClick={onBack}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-xl transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-600 to-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-md overflow-hidden">
          {friend.avatar_url ? (
            <img src={getAvatarUrl(friend.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            getInitials(friend.username)
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-lg">{friend.username}</h3>
          <div className="flex items-center gap-2">
            <p className="text-sm text-green-600 font-medium">{getLastSeenText()}</p>
            {sharedSecret && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Lock size={12} className="text-green-600" />
                <span>End-to-End Encrypted</span>
              </div>
            )}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-gray-100 rounded-xl transition"
          >
            <MoreVertical size={20} />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200/50 z-[100] overflow-hidden backdrop-blur-sm">
              <button
                onClick={() => {
                  setIsGhostMode(!isGhostMode);
                  setShowMenu(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 font-medium border-b border-gray-100 transition-colors ${
                  isGhostMode ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
                }`}
              >
                <Ghost size={18} className={isGhostMode ? 'text-purple-600' : ''} />
                <div className="flex-1">
                  <div className="font-semibold">Ghost Mode</div>
                  <div className="text-xs opacity-75">{isGhostMode ? 'Messages disappear' : 'Normal messages'}</div>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors relative ${
                  isGhostMode ? 'bg-purple-600' : 'bg-gray-300'
                }`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                    isGhostMode ? 'translate-x-5' : 'translate-x-0.5'
                  }`}></div>
                </div>
              </button>
              <button
                onClick={() => {
                  handleClearChat();
                  setShowMenu(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 font-medium border-b border-gray-100"
              >
                <Trash2 size={18} />
                Clear Chat
              </button>
              {blockStatus.isBlocked && blockStatus.blockerId === user.id ? (
                <button
                  onClick={handleUnblockUser}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-green-600 font-medium"
                >
                  <Ban size={18} />
                  Unblock User
                </button>
              ) : (
                <button
                  onClick={handleBlockUser}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-red-600 font-medium"
                >
                  <Ban size={18} />
                  Block User
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Blocked Status Banner */}
      {blockStatus.isBlocked && (
        <div className="bg-red-50 border-b border-red-200 p-3 text-center">
          {blockStatus.blockerId === user.id ? (
            <p className="text-red-700 text-sm">You blocked this user</p>
          ) : (
            <p className="text-red-700 text-sm">You cannot reply to this conversation</p>
          )}
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-t-cyan-700 border-gray-200"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-lg">No messages yet. Say hi! 👋</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => {
              const isMyMessage = message.sender_id === user.id;
              const isEditing = editingMessageId === message.id;
              const repliedMessage = message.reply_to_id ? messages.find(m => m.id === message.reply_to_id) : null;
              const isNearBottom = index >= messages.length - 2;
              
              return (
                <div
                  key={message.id}
                  id={`message-${message.id}`}
                  className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'} group transition-all`}
                >
                  <div className={`flex items-start gap-2 ${isMyMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                    
                    <div
                      className={`relative max-w-xs lg:max-w-md px-4 py-3 ${
                        isMyMessage
                          ? 'bg-cyan-700 text-white rounded-2xl rounded-tr-sm shadow-md'
                          : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
                      } ${message.is_deleted === 1 ? 'italic opacity-75' : ''}`}
                    >
                      {/* Dropdown Trigger Icon */}
                      {!isEditing && !message.is_deleted && (
                        <button
                          onClick={() => toggleMenu(message.id)}
                          className={`absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                            isMyMessage ? 'text-white hover:bg-cyan-800' : 'text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <ChevronDown size={16} />
                        </button>
                      )}

                      {/* Dropdown Menu */}
                      {activeMenuId === message.id && !isEditing && !message.is_deleted && (
                        <div
                          ref={menuRef}
                          className={`absolute bg-white text-gray-800 rounded-lg shadow-2xl z-50 w-40 py-2 
                            ${isMyMessage ? 'right-0' : 'left-0'}
                            ${isNearBottom 
                              ? 'bottom-full mb-2 origin-bottom' 
                              : 'top-8 origin-top'
                            }
                          `}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Reply Option */}
                          <button
                            onClick={() => {
                              handleReply(message);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-gray-100 transition"
                          >
                            <Reply size={16} />
                            <span className="text-sm">Reply</span>
                          </button>

                          {/* Edit Option - Only for own messages */}
                          {isMyMessage && (
                            <button
                              onClick={() => {
                                startEditMessage(message);
                                setActiveMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-gray-100 transition"
                            >
                              <Edit2 size={16} />
                              <span className="text-sm">Edit</span>
                            </button>
                          )}

                          {/* Delete Options */}
                          {isMyMessage ? (
                            <>
                              <button
                                onClick={() => {
                                  setDeletingMessageId(message.id);
                                  setShowDeleteModal(true);
                                  setActiveMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-gray-100 transition text-red-600"
                              >
                                <Trash2 size={16} />
                                <span className="text-sm">Delete</span>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={async () => {
                                setDeletingMessageId(message.id);
                                setActiveMenuId(null);
                                
                                // Delete for me directly
                                try {
                                  const response = await fetch(getApiUrl(`api/messages/delete/${message.id}`), {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                      userId: user.id,
                                      mode: 'me'
                                    })
                                  });

                                  if (response.ok) {
                                    setMessages(prev => prev.filter(msg => msg.id !== message.id));
                                  }
                                } catch (error) {
                                  console.error('Error deleting message:', error);
                                }
                              }}
                              className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-gray-100 transition text-red-600"
                            >
                              <Trash2 size={16} />
                              <span className="text-sm">Delete for me</span>
                            </button>
                          )}
                        </div>
                      )}

                      {isEditing ? (
                        // Inline editing mode
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-800 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => saveEdit(message.id)}
                              className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-4 py-1.5 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600 flex items-center gap-1 transition"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Replied Message Preview */}
                          {repliedMessage && (
                            <div
                              onClick={() => scrollToMessage(repliedMessage.id)}
                              className={`mb-2 p-2 rounded-lg cursor-pointer border-l-2 ${
                                isMyMessage 
                                  ? 'bg-cyan-800 border-white/50' 
                                  : 'bg-gray-200 border-cyan-600'
                              }`}
                            >
                              <p className="text-xs font-semibold mb-1">
                                {repliedMessage.sender_id === user.id ? 'You' : friend.username}
                              </p>
                              <p className="text-xs opacity-80 truncate">
                                {getReplyPreviewText(repliedMessage)}
                              </p>
                            </div>
                          )}
                          
                          {/* Message Content - Text, Image, Audio, or File */}
                          {message.type === 'image' ? (
                            <div className="relative group">
                              <img
                                src={getAssetUrl(message.message)}
                                alt="Image"
                                className="max-w-full max-h-96 rounded-lg cursor-pointer hover:opacity-90 transition"
                                onClick={() => setLightboxImage(getAssetUrl(message.message))}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.parentElement.innerHTML = '<p class="text-red-500 text-sm">❌ Image failed to load</p>';
                                }}
                              />
                            </div>
                          ) : message.type === 'audio' ? (
                            <div className="flex items-center gap-2">
                              <Mic size={18} className={isMyMessage ? 'text-white' : 'text-cyan-600'} />
                              <audio
                                controls
                                src={getAssetUrl(message.message)}
                                className={`h-10 ${
                                  isMyMessage 
                                    ? 'audio-player-teal' 
                                    : 'audio-player-gray'
                                }`}
                                style={{ width: '240px' }}
                              />
                            </div>
                          ) : message.type === 'file' ? (
                            (() => {
                              try {
                                const fileData = JSON.parse(message.message);
                                return (
                                  <a
                                    href={getAssetUrl(fileData.url)}
                                    download={fileData.filename}
                                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                                      isMyMessage 
                                        ? 'bg-cyan-700 border-cyan-600 hover:bg-cyan-600' 
                                        : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
                                    } transition cursor-pointer`}
                                  >
                                    <div className={`p-2 rounded-lg ${
                                      isMyMessage ? 'bg-cyan-600' : 'bg-gray-300'
                                    }`}>
                                      <Paperclip size={20} className={isMyMessage ? 'text-white' : 'text-gray-700'} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`font-medium truncate text-sm ${
                                        isMyMessage ? 'text-white' : 'text-gray-800'
                                      }`}>
                                        {fileData.filename}
                                      </p>
                                      <p className={`text-xs ${
                                        isMyMessage ? 'text-cyan-200' : 'text-gray-500'
                                      }`}>
                                        {formatFileSize(fileData.size)} • PDF
                                      </p>
                                    </div>
                                    <ChevronDown 
                                      size={16} 
                                      className={`transform -rotate-90 ${
                                        isMyMessage ? 'text-white' : 'text-gray-600'
                                      }`} 
                                    />
                                  </a>
                                );
                              } catch (error) {
                                // Fallback for legacy file format
                                return (
                                  <a
                                    href={getAssetUrl(message.message)}
                                    download
                                    className={`flex items-center gap-2 ${isMyMessage ? 'text-white hover:text-cyan-200' : 'text-cyan-600 hover:text-cyan-800'} transition`}
                                  >
                                    <Paperclip size={16} />
                                    <span className="underline">Download File</span>
                                  </a>
                                );
                              }
                            })()
                          ) : (
                            <p className="break-words text-[15px] leading-relaxed">{message.message}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Timestamp outside bubble */}
                  {!isEditing && (
                    <div className={`flex items-center gap-1 mt-1 px-1 ${isMyMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="text-xs text-gray-500">
                        {(() => {
                          // SQLite returns timestamps without 'Z', so add it to indicate UTC
                          const timestamp = message.created_at.endsWith('Z') 
                            ? message.created_at 
                            : message.created_at + 'Z';
                          return new Date(timestamp).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          });
                        })()}
                      </span>
                      {message.is_disappearing === 1 && (
                        <Ghost size={12} className="text-purple-500" title="Disappearing message" />
                      )}
                      {message.is_edited === 1 && (
                        <span className="text-xs italic text-gray-500">
                          (edited)
                        </span>
                      )}
                      {isMyMessage && renderMessageStatus(message)}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className={`p-5 border-t border-gray-200/50 transition-colors relative ${isGhostMode ? 'bg-gray-800' : 'bg-white/90 backdrop-blur'}`}>
        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className={`mb-3 px-4 py-2 rounded-lg border-l-4 flex items-center justify-between ${
            isGhostMode ? 'bg-gray-700 border-purple-500' : 'bg-gray-100 border-cyan-600'
          }`}>
            <div className="flex-1">
              <p className={`text-xs font-semibold ${isGhostMode ? 'text-white' : 'text-gray-700'}`}>
                Replying to {replyingTo.sender_id === user.id ? 'yourself' : friend.username}
              </p>
              <p className={`text-sm truncate ${isGhostMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {getReplyPreviewText(replyingTo)}
              </p>
            </div>
            <button
              onClick={cancelReply}
              className={`p-1 rounded-lg ${isGhostMode ? 'hover:bg-gray-600' : 'hover:bg-gray-200'}`}
            >
              <X size={16} className={isGhostMode ? 'text-white' : 'text-gray-600'} />
            </button>
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-20 left-5 z-50">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}

        {/* Upload Progress Bar */}
        {uploading && uploadProgress > 0 && (
          <div className={`mb-3 p-3 rounded-lg ${isGhostMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-sm font-medium ${isGhostMode ? 'text-white' : 'text-gray-700'}`}>
                Uploading...
              </span>
              <span className={`text-sm font-bold ${isGhostMode ? 'text-white' : 'text-cyan-600'}`}>
                {uploadProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-300 rounded-full h-2 overflow-hidden">
              <div
                className="bg-cyan-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex items-start gap-2 sm:gap-3">
          {/* File Upload Input (Hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {isRecording ? (
            /* Recording Mode Bar */
            <div className={`flex-1 flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-md ${
              isGhostMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              {/* Pulsing Red Dot */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className={`text-xs sm:text-sm font-medium ${isGhostMode ? 'text-white' : 'text-gray-900'}`}>
                  Recording
                </span>
              </div>

              {/* Timer */}
              <span className={`text-base sm:text-lg font-mono font-bold ${isGhostMode ? 'text-white' : 'text-gray-900'}`}>
                {formatTime(recordingTime)}
              </span>

              {/* Spacer */}
              <div className="flex-1"></div>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCancelRecording}
                className="p-2 sm:p-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition shadow-md flex-shrink-0"
                title="Cancel recording"
              >
                <X size={18} className="sm:w-5 sm:h-5" />
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleSendAudio}
                className="p-2 sm:p-2.5 rounded-full bg-green-500 hover:bg-green-600 text-white transition shadow-md flex-shrink-0"
                title="Send voice message"
              >
                <Check size={18} className="sm:w-5 sm:h-5" />
              </button>
            </div>
          ) : (
            <>
              {/* Paperclip Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || (blockStatus.isBlocked && blockStatus.blockerId !== user.id)}
                className={`p-2 sm:p-3 rounded-full transition-all shadow-md flex-shrink-0 ${
                  uploading
                    ? 'bg-gray-400 text-gray-200 cursor-wait'
                    : isGhostMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={uploading ? "Uploading..." : "Attach file"}
              >
                <Paperclip size={18} className={`sm:w-5 sm:h-5 ${uploading ? 'animate-pulse' : ''}`} />
              </button>

              {/* Microphone Button */}
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={uploading || (blockStatus.isBlocked && blockStatus.blockerId !== user.id)}
                className={`p-2 sm:p-3 rounded-full transition-all shadow-md flex-shrink-0 ${
                  uploading
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    : isGhostMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Record voice message"
              >
                <Mic size={18} className="sm:w-5 sm:h-5" />
              </button>

              {/* Emoji Button */}
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-2 sm:p-3 rounded-full transition-all shadow-md flex-shrink-0 ${
                  showEmojiPicker
                    ? 'bg-yellow-400 text-white hover:bg-yellow-500'
                    : isGhostMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                title="Add emoji"
              >
                <Smile size={18} className="sm:w-5 sm:h-5" />
              </button>

              {/* Auto-Expanding Textarea */}
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  autoResizeTextarea();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder={
                  blockStatus.isBlocked && blockStatus.blockerId !== user.id
                    ? "You cannot reply to this conversation"
                    : isGhostMode
                    ? "👻 Ghost message (disappears after 5 min)..."
                    : "Type a message..."
                }
                disabled={blockStatus.isBlocked && blockStatus.blockerId !== user.id}
                rows={1}
                className={`flex-1 min-w-0 px-3 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-base border-0 rounded-2xl focus:ring-2 focus:ring-cyan-500 outline-none disabled:cursor-not-allowed transition resize-none overflow-hidden ${
                  isGhostMode
                    ? 'bg-gray-700 text-white placeholder-gray-400'
                    : 'bg-gray-100 text-gray-900 placeholder-gray-500 focus:bg-white disabled:bg-gray-200'
                }`}
                style={{ maxHeight: '120px' }}
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!newMessage.trim() || (blockStatus.isBlocked && blockStatus.blockerId !== user.id)}
                className="bg-gradient-to-r from-cyan-700 to-teal-600 hover:from-cyan-800 hover:to-teal-700 text-white p-2.5 sm:p-3.5 rounded-full transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex-shrink-0"
              >
                <Send size={18} className="sm:w-5 sm:h-5" />
              </button>
            </>
          )}
        </form>
      </div>

      {/* Delete Message Modal */}
      {showDeleteModal && deletingMessageId && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowDeleteModal(false);
            setDeletingMessageId(null);
          }}
        >
          <div 
            className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-gray-900">Delete Message</h3>
            
            <p className="text-gray-600 text-sm">
              Choose how you want to delete this message:
            </p>

            <div className="space-y-3">
              {messages.find(m => m.id === deletingMessageId)?.sender_id === user.id && (
                <button
                  onClick={() => handleDeleteMessage('everyone')}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition font-medium flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  Delete for Everyone
                </button>
              )}

              <button
                onClick={() => handleDeleteMessage('me')}
                className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl transition font-medium flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Delete for Me
              </button>

              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingMessageId(null);
                }}
                className="w-full px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl transition font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />

      {/* Image Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition text-white"
          >
            <X size={24} />
          </button>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
