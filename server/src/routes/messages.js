import express from 'express';
import db from '../database.js';

const router = express.Router();

// Store io instance for emitting events
let io;

// Import timer cleanup function
let clearMessageTimer;

export function setSocketIO(socketIO) {
  io = socketIO;
}

export function setTimerCleanup(cleanupFn) {
  clearMessageTimer = cleanupFn;
}

// Get chat history between current user and friend
router.get('/:userId/:friendId', (req, res) => {
  const { userId, friendId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  db.all(
    `SELECT * FROM messages 
     WHERE (sender_id = ? AND receiver_id = ?) 
        OR (sender_id = ? AND receiver_id = ?)
     ORDER BY created_at ASC
     LIMIT ? OFFSET ?`,
    [userId, friendId, friendId, userId, parseInt(limit), parseInt(offset)],
    (err, messages) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching messages' });
      }
      
      console.log(`[MESSAGES] Fetched ${messages.length} messages for user ${userId}`);
      
      // Filter out messages hidden for this user
      const filteredMessages = messages.filter(msg => {
        if (!msg.hidden_for_user_ids || msg.hidden_for_user_ids === '') {
          return true; // Show message if no hidden_for_user_ids
        }
        
        // Debug: Log the raw value
        if (messages.indexOf(msg) === 0) {
          console.log(`[MESSAGES DEBUG] Sample hidden_for_user_ids value: "${msg.hidden_for_user_ids}" (type: ${typeof msg.hidden_for_user_ids})`);
        }
        
        try {
          const hiddenForUsers = JSON.parse(msg.hidden_for_user_ids);
          const isHidden = hiddenForUsers.includes(parseInt(userId));
          if (isHidden) {
            console.log(`[MESSAGES] Hiding message ${msg.id} from user ${userId}`);
          }
          return !isHidden;
        } catch (e) {
          console.error(`[MESSAGES] Error parsing hidden_for_user_ids for message ${msg.id}: "${msg.hidden_for_user_ids}"`, e.message);
          // Fail open: show message if parsing fails (corrupted data shouldn't hide messages)
          return true;
        }
      });
      
      console.log(`[MESSAGES] After filtering: ${filteredMessages.length} messages visible to user ${userId}`);
      res.json(filteredMessages);
    }
  );
});

// Send message
router.post('/send', (req, res) => {
  const { senderId, receiverId, message, isDisappearing, replyToId, type } = req.body;

  if (!senderId || !receiverId || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Check if sender is blocked by receiver or vice versa
  db.get(
    `SELECT * FROM blocked_users 
     WHERE (blocker_id = ? AND blocked_id = ?) 
        OR (blocker_id = ? AND blocked_id = ?)`,
    [senderId, receiverId, receiverId, senderId],
    (err, block) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      if (block) {
        return res.status(403).json({ error: 'Cannot send message. User is blocked.' });
      }

      // Proceed with sending message
      db.run(
        'INSERT INTO messages (sender_id, receiver_id, message, status, is_disappearing, reply_to_id, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [senderId, receiverId, message, 'sent', isDisappearing ? 1 : 0, replyToId || null, type || 'text'],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Error sending message' });
          }

          const messageId = this.lastID;
          const messageData = {
            id: messageId,
            sender_id: senderId,
            receiver_id: receiverId,
            message,
            status: 'sent',
            is_deleted: 0,
            is_edited: 0,
            is_disappearing: isDisappearing ? 1 : 0,
            reply_to_id: replyToId || null,
            created_at: new Date().toISOString()
          };

          // Emit socket event to receiver
          if (io) {
            io.emit('receive_message', messageData);
          }

          res.status(201).json(messageData);
        }
      );
    }
  );
});

// Delete message
router.post('/delete/:messageId', (req, res) => {
  const { messageId } = req.params;
  const { userId, mode } = req.body; // mode: 'everyone' or 'me'

  // First check if the message exists
  db.get('SELECT * FROM messages WHERE id = ?', [messageId], (err, message) => {
    if (err || !message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (mode === 'everyone') {
      // Delete for everyone - only sender can do this
      if (message.sender_id !== userId) {
        return res.status(403).json({ error: 'Only sender can delete for everyone' });
      }

      db.run(
        'UPDATE messages SET is_deleted = 1, message = ? WHERE id = ?',
        ['This message was deleted', messageId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: 'Error deleting message' });
          }

          // Clear any pending disappearing message timer
          if (clearMessageTimer) {
            clearMessageTimer(parseInt(messageId));
          }

          const updateData = {
            id: parseInt(messageId),
            is_deleted: 1,
            message: 'This message was deleted',
            sender_id: message.sender_id,
            receiver_id: message.receiver_id
          };

          console.log('[DELETE] Emitting message_deleted event:', updateData);

          // Emit socket event to both users
          if (io) {
            io.emit('message_deleted', updateData);
            console.log('[DELETE] Event emitted successfully');
          } else {
            console.error('[DELETE] io is not available');
          }

          res.json({ message: 'Message deleted for everyone' });
        }
      );
    } else if (mode === 'me') {
      // Delete for me - hide from this user only
      let hiddenForUsers = [];
      try {
        hiddenForUsers = message.hidden_for_user_ids ? JSON.parse(message.hidden_for_user_ids) : [];
      } catch (e) {
        hiddenForUsers = [];
      }

      if (!hiddenForUsers.includes(userId)) {
        hiddenForUsers.push(userId);
      }

      db.run(
        'UPDATE messages SET hidden_for_user_ids = ? WHERE id = ?',
        [JSON.stringify(hiddenForUsers), messageId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: 'Error hiding message' });
          }

          res.json({ message: 'Message deleted for you' });
        }
      );
    } else {
      return res.status(400).json({ error: 'Invalid mode. Use "everyone" or "me"' });
    }
  });
});

// Edit message
router.put('/edit/:messageId', (req, res) => {
  const { messageId } = req.params;
  const { userId, newContent } = req.body;

  console.log('Edit request received:', { messageId, userId, newContent });

  if (!userId || !newContent || !newContent.trim()) {
    return res.status(400).json({ error: 'User ID and new content are required' });
  }

  // Check if the message belongs to the user
  db.get('SELECT * FROM messages WHERE id = ?', [messageId], (err, message) => {
    if (err) {
      console.error('Database error fetching message:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!message) {
      console.error('Message not found:', messageId);
      return res.status(404).json({ error: 'Message not found' });
    }

    console.log('Message found:', message);

    if (message.sender_id !== userId) {
      console.error('Unauthorized edit attempt:', { sender_id: message.sender_id, userId });
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (message.is_deleted === 1) {
      return res.status(400).json({ error: 'Cannot edit deleted message' });
    }

    db.run(
      'UPDATE messages SET message = ?, is_edited = 1 WHERE id = ?',
      [newContent.trim(), messageId],
      (err) => {
        if (err) {
          console.error('Database error updating message:', err);
          return res.status(500).json({ error: 'Error editing message' });
        }

        const updateData = {
          id: messageId,
          message: newContent.trim(),
          is_edited: 1,
          sender_id: message.sender_id,
          receiver_id: message.receiver_id
        };

        console.log('Message updated successfully:', updateData);

        // Emit socket event to both users
        if (io) {
          io.emit('message_updated', updateData);
        }

        res.json({ message: 'Message edited successfully', data: updateData });
      }
    );
  });
});

// Mark messages as read
router.post('/mark-read', (req, res) => {
  const { userId, friendId } = req.body;

  if (!userId || !friendId) {
    return res.status(400).json({ error: 'UserId and friendId are required' });
  }

  // First, get all disappearing messages that are being marked as read
  db.all(
    `SELECT id FROM messages 
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
            return res.status(500).json({ error: 'Error marking messages as read' });
          }

          // Emit socket event to sender
          if (io && this.changes > 0) {
            io.emit('messages_read', {
              senderId: friendId,
              receiverId: userId
            });
          }

          // Schedule disappearing messages to expire after 5 minutes
          if (disappearingMessages && disappearingMessages.length > 0) {
            console.log(`Scheduling ${disappearingMessages.length} disappearing messages to expire in 5 minutes`);
            disappearingMessages.forEach(msg => {
              console.log(`Timer started for message ID: ${msg.id}`);
              setTimeout(() => {
                console.log(`Expiring message ID: ${msg.id}`);
                db.run(
                  `UPDATE messages SET message = 'Message expired', is_deleted = 1 WHERE id = ?`,
                  [msg.id],
                  (err) => {
                    if (err) {
                      console.error('Error expiring message:', err);
                    } else {
                      console.log(`Message ${msg.id} expired successfully`);
                      // Emit socket event to notify both users
                      if (io) {
                        io.emit('message_expired', {
                          messageId: msg.id,
                          senderId: friendId,
                          receiverId: userId
                        });
                      }
                    }
                  }
                );
              }, 5 * 60 * 1000); // 5 minutes
            });
          }

          res.json({ message: 'Messages marked as read', count: this.changes });
        }
      );
    }
  );
});

// Get user status (online/last_seen)
router.get('/user-status/:userId', (req, res) => {
  const { userId } = req.params;

  db.get(
    'SELECT id, username, is_online, last_seen FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    }
  );
});

// Clear chat - hide all messages between current user and friend
router.post('/clear/:friendId', (req, res) => {
  const { friendId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Get all messages between these users
  db.all(
    `SELECT id, hidden_for_user_ids FROM messages 
     WHERE (sender_id = ? AND receiver_id = ?) 
        OR (sender_id = ? AND receiver_id = ?)`,
    [userId, friendId, friendId, userId],
    (err, messages) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching messages' });
      }

      if (messages.length === 0) {
        return res.json({ message: 'No messages to clear' });
      }

      // Update each message to hide it from this user
      let completed = 0;
      let hasError = false;

      messages.forEach(msg => {
        let hiddenForUsers = [];
        try {
          hiddenForUsers = msg.hidden_for_user_ids ? JSON.parse(msg.hidden_for_user_ids) : [];
        } catch (e) {
          hiddenForUsers = [];
        }

        if (!hiddenForUsers.includes(parseInt(userId))) {
          hiddenForUsers.push(parseInt(userId));
        }

        db.run(
          'UPDATE messages SET hidden_for_user_ids = ? WHERE id = ?',
          [JSON.stringify(hiddenForUsers), msg.id],
          (err) => {
            if (err && !hasError) {
              hasError = true;
              return res.status(500).json({ error: 'Error clearing chat' });
            }

            completed++;
            if (completed === messages.length && !hasError) {
              res.json({ message: 'Chat cleared successfully', count: messages.length });
            }
          }
        );
      });
    }
  );
});

export default router;
