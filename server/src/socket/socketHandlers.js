import db from '../database.js';

// Store connected users: userId -> socketId
const connectedUsers = new Map();

// Store message timers to prevent memory leaks: messageId -> timerId
const messageTimers = new Map();

// Store message counts for throttling: userId -> { count, resetTime }
const messageCounts = new Map();

// Throttle configuration
const RATE_LIMIT = 20; // messages per minute
const RATE_WINDOW = 60000; // 1 minute in ms

// Helper function to check rate limit
function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = messageCounts.get(userId) || { count: 0, resetTime: now + RATE_WINDOW };
  
  // Reset if time window expired
  if (now > userLimit.resetTime) {
    userLimit.count = 0;
    userLimit.resetTime = now + RATE_WINDOW;
  }
  
  // Check if limit exceeded
  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }
  
  // Increment count
  userLimit.count++;
  messageCounts.set(userId, userLimit);
  return true;
}

// Helper function to clear a message timer
function clearMessageTimer(messageId) {
  const timerId = messageTimers.get(messageId);
  if (timerId) {
    clearTimeout(timerId);
    messageTimers.delete(messageId);
    console.log(`[TIMER] Cleared timer for message ${messageId}`);
  }
}

// Helper function to calculate remaining time for a message
function calculateRemainingTime(readAt) {
  const EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
  const readTime = new Date(readAt).getTime();
  const currentTime = Date.now();
  const elapsed = currentTime - readTime;
  const remaining = EXPIRATION_TIME - elapsed;
  
  return remaining > 0 ? remaining : 0;
}

// Initialize timers for disappearing messages on server startup
function initializeDisappearingMessageTimers(io) {
  console.log('[DISAPPEARING] Initializing timers for existing messages...');
  
  db.all(
    `SELECT id, sender_id, receiver_id, read_at 
     FROM messages 
     WHERE is_disappearing = 1 
     AND status = 'read' 
     AND is_deleted = 0 
     AND read_at IS NOT NULL`,
    [],
    (err, messages) => {
      if (err) {
        console.error('[DISAPPEARING] Error fetching messages for timer restoration:', err);
        return;
      }
      
      if (!messages || messages.length === 0) {
        console.log('[DISAPPEARING] No messages need timer restoration');
        return;
      }
      
      console.log(`[DISAPPEARING] Found ${messages.length} messages that need timers`);
      
      let expired = 0;
      let scheduled = 0;
      
      messages.forEach(msg => {
        const remainingTime = calculateRemainingTime(msg.read_at);
        
        if (remainingTime === 0) {
          // Message should have already expired, expire it immediately
          console.log(`[DISAPPEARING] Message ${msg.id} already past expiration, expiring now`);
          db.run(
            `UPDATE messages SET message = 'Message expired', is_deleted = 1 WHERE id = ?`,
            [msg.id],
            (err) => {
              if (err) {
                console.error(`[DISAPPEARING] Error expiring message ${msg.id}:`, err);
              } else {
                console.log(`[DISAPPEARING] Message ${msg.id} expired successfully`);
                // Emit socket event to notify both users
                io.emit('message_expired', {
                  messageId: msg.id,
                  senderId: msg.sender_id,
                  receiverId: msg.receiver_id
                });
              }
            }
          );
          expired++;
        } else {
          // Schedule timer for remaining time
          console.log(`[DISAPPEARING] Scheduling message ${msg.id} to expire in ${Math.round(remainingTime / 1000)}s`);
          const timerId = setTimeout(() => {
            console.log(`[DISAPPEARING] Expiring message ID: ${msg.id} at ${new Date().toISOString()}`);
            db.run(
              `UPDATE messages SET message = 'Message expired', is_deleted = 1 WHERE id = ?`,
              [msg.id],
              (err) => {
                if (err) {
                  console.error('[DISAPPEARING] Error expiring message:', err);
                } else {
                  console.log(`[DISAPPEARING] Message ${msg.id} expired successfully`);
                  // Emit socket event to notify both users
                  io.emit('message_expired', {
                    messageId: msg.id,
                    senderId: msg.sender_id,
                    receiverId: msg.receiver_id
                  });
                  // Clean up timer reference
                  messageTimers.delete(msg.id);
                }
              }
            );
          }, remainingTime);
          
          messageTimers.set(msg.id, timerId);
          scheduled++;
        }
      });
      
      console.log(`[DISAPPEARING] Timer initialization complete: ${expired} expired immediately, ${scheduled} scheduled`);
    }
  );
}

// Export the cleanup function and initialization
export { clearMessageTimer, initializeDisappearingMessageTimers };

export function setupSocketHandlers(io) {
  // Initialize timers for existing disappearing messages
  initializeDisappearingMessageTimers(io);
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Register user and mark as online
    socket.on('register', (userId) => {
      // Validate userId matches authenticated socket user
      if (userId !== socket.userId) {
        console.error(`Authentication mismatch: ${userId} vs ${socket.userId}`);
        return;
      }
      
      connectedUsers.set(userId, socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}`);

      // Update user status to online
      db.run(
        'UPDATE users SET is_online = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
        [userId],
        (err) => {
          if (err) {
            console.error('Error updating user status:', err);
          } else {
            // Broadcast online status to all connected users
            io.emit('user_status_change', { userId, isOnline: true });
          }
        }
      );

      // Deliver pending offline messages
      deliverOfflineMessages(userId, socket);
    });

    // Send message with acknowledgement
    socket.on('send_message', (data, callback) => {
      const { sender_id, receiver_id, message, isDisappearing, replyToId, type } = data;

      // Validate required fields
      if (!sender_id || !receiver_id || !message) {
        return callback({ success: false, error: 'Invalid message data' });
      }

      // Validate sender matches authenticated user
      if (sender_id !== socket.userId) {
        console.error(`Unauthorized send attempt: ${sender_id} vs ${socket.userId}`);
        return callback({ success: false, error: 'Unauthorized' });
      }

      // Check rate limit
      if (!checkRateLimit(sender_id)) {
        console.warn(`Rate limit exceeded for user ${sender_id}`);
        return callback({ success: false, error: 'Too many messages. Please slow down.' });
      }

      // Save message to database
      db.run(
        'INSERT INTO messages (sender_id, receiver_id, message, status, is_disappearing, reply_to_id, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sender_id, receiver_id, message, 'sent', isDisappearing ? 1 : 0, replyToId || null, type || 'text'],
        function(err) {
          if (err) {
            console.error('Error saving message:', err);
            callback({ success: false, error: 'Failed to send message' });
            return;
          }

          const messageId = this.lastID;
          const messageData = {
            id: messageId,
            sender_id,
            receiver_id,
            message,
            status: 'sent',
            is_deleted: 0,
            is_disappearing: isDisappearing ? 1 : 0,
            reply_to_id: replyToId || null,
            type: type || 'text',
            created_at: new Date().toISOString()
          };
          
          console.log('Message saved with is_disappearing:', isDisappearing ? 1 : 0);
          
          // Acknowledge message saved (shows "Sent" tick)
          callback({ success: true, messageId, status: 'sent' });

          // Check if receiver is online
          const receiverSocketId = connectedUsers.get(receiver_id);
          
          if (receiverSocketId) {
            // Receiver is online, deliver message
            io.to(receiverSocketId).emit('receive_message', {
              ...messageData,
              status: 'delivered'
            });

            // Update message status to delivered
            db.run(
              'UPDATE messages SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE id = ?',
              ['delivered', messageId],
              (err) => {
                if (err) {
                  console.error('Error updating message status:', err);
                } else {
                  // Notify sender that message was delivered
                  socket.emit('message_delivered', { messageId, status: 'delivered' });
                }
              }
            );
          } else {
            // Receiver is offline, message stored for later delivery
            console.log(`User ${receiver_id} is offline. Message stored.`);
          }
        }
      );
    });

    // Mark messages as read
    socket.on('mark_messages_read', (data) => {
      const { userId, friendId } = data;

      // Validate userId matches authenticated user
      if (userId !== socket.userId) {
        console.error(`Unauthorized mark_read attempt: ${userId} vs ${socket.userId}`);
        return;
      }

      // First, get all disappearing messages that are being marked as read
      db.all(
        `SELECT id, read_at FROM messages 
         WHERE receiver_id = ? AND sender_id = ? AND status != 'read' AND is_disappearing = 1`,
        [userId, friendId],
        (err, disappearingMessages) => {
          if (err) {
            console.error('Error fetching disappearing messages:', err);
          }

          // Update messages to read status
          db.run(
            `UPDATE messages 
             SET status = 'read', read_at = CURRENT_TIMESTAMP 
             WHERE receiver_id = ? AND sender_id = ? AND status != 'read'`,
            [userId, friendId],
            function(err) {
              if (err) {
                console.error('Error marking messages as read:', err);
                return;
              }

              if (this.changes > 0) {
                // Notify sender that messages were read
                const senderSocketId = connectedUsers.get(friendId);
                if (senderSocketId) {
                  io.to(senderSocketId).emit('messages_read', {
                    senderId: friendId,
                    receiverId: userId
                  });
                }
              }

              // Schedule disappearing messages to expire after 5 minutes
              if (disappearingMessages && disappearingMessages.length > 0) {
                console.log(`[DISAPPEARING] Scheduling ${disappearingMessages.length} messages to expire in 5 minutes`);
                console.log(`[DISAPPEARING] Message IDs:`, disappearingMessages.map(m => m.id));
                
                // Small delay to ensure read_at is committed to database
                setTimeout(() => {
                  disappearingMessages.forEach(msg => {
                    console.log(`[DISAPPEARING] Timer started for message ID: ${msg.id} at ${new Date().toISOString()}`);
                    
                    // Store timer reference to prevent memory leaks
                    const timerId = setTimeout(() => {
                      console.log(`[DISAPPEARING] Expiring message ID: ${msg.id} at ${new Date().toISOString()}`);
                      db.run(
                        `UPDATE messages SET message = 'Message expired', is_deleted = 1 WHERE id = ?`,
                        [msg.id],
                        (err) => {
                          if (err) {
                            console.error('[DISAPPEARING] Error expiring message:', err);
                          } else {
                            console.log(`[DISAPPEARING] Message ${msg.id} expired successfully`);
                            // Emit socket event to notify both users
                            io.emit('message_expired', {
                              messageId: msg.id,
                              senderId: friendId,
                              receiverId: userId
                            });
                            // Clean up timer reference
                            messageTimers.delete(msg.id);
                          }
                        }
                      );
                    }, 5 * 60 * 1000); // 5 minutes
                    
                    // Store the timer reference
                    messageTimers.set(msg.id, timerId);
                  });
                }, 100); // 100ms delay to ensure database commit
              }
            }
          );
        }
      );
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const { userId, friendId, isTyping } = data;
      
      // Validate userId matches authenticated user
      if (userId !== socket.userId) {
        console.error(`Unauthorized typing event: ${userId} vs ${socket.userId}`);
        return;
      }
      
      const friendSocketId = connectedUsers.get(friendId);
      
      if (friendSocketId) {
        io.to(friendSocketId).emit('user_typing', {
          userId,
          isTyping
        });
      }
    });

    // Disconnect - Update last_seen
    socket.on('disconnect', () => {
      // Find and remove user from connected users
      for (const [userId, socketId] of connectedUsers.entries()) {
        if (socketId === socket.id) {
          connectedUsers.delete(userId);
          
          // Update user status to offline and set last_seen
          db.run(
            'UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
            [userId],
            (err) => {
              if (err) {
                console.error('Error updating last_seen:', err);
              } else {
                console.log(`User ${userId} disconnected. Last seen updated.`);
                // Broadcast offline status
                io.emit('user_status_change', { userId, isOnline: false });
              }
            }
          );
          break;
        }
      }
    });
  });
}

// Deliver offline messages when user comes online
function deliverOfflineMessages(userId, socket) {
  db.all(
    'SELECT * FROM messages WHERE receiver_id = ? AND status = ? ORDER BY created_at ASC',
    [userId, 'sent'],
    (err, messages) => {
      if (err) {
        console.error('Error fetching offline messages:', err);
        return;
      }

      if (messages.length > 0) {
        console.log(`Delivering ${messages.length} offline messages to user ${userId}`);
        
        messages.forEach((message) => {
          socket.emit('receive_message', {
            id: message.id,
            sender_id: message.sender_id,
            receiver_id: message.receiver_id,
            message: message.message,
            status: 'delivered',
            is_deleted: message.is_deleted,
            is_disappearing: message.is_disappearing || 0,
            created_at: message.created_at
          });

          // Update message status to delivered
          db.run(
            'UPDATE messages SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['delivered', message.id]
          );

          // Notify sender if online
          const senderSocketId = connectedUsers.get(message.sender_id);
          if (senderSocketId) {
            socket.to(senderSocketId).emit('message_delivered', { 
              messageId: message.id, 
              status: 'delivered' 
            });
          }
        });
      }
    }
  );
}
