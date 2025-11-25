import express from 'express';
import db from '../database.js';

const router = express.Router();

// Store io instance for emitting events
let io;

export function setSocketIO(socketIO) {
  io = socketIO;
}

// Search users (exclude current user and existing friends)
router.get('/search', (req, res) => {
  const { query, userId, limit = 20, offset = 0 } = req.query;

  if (!query || !userId) {
    return res.status(400).json({ error: 'Query and userId are required' });
  }

  // Get user's existing friends and pending requests
  const friendsQuery = `
    SELECT DISTINCT 
      CASE 
        WHEN f.user1_id = ? THEN f.user2_id 
        ELSE f.user1_id 
      END as friend_id
    FROM friends f
    WHERE f.user1_id = ? OR f.user2_id = ?
  `;

  const requestsQuery = `
    SELECT receiver_id FROM friend_requests 
    WHERE sender_id = ? AND status = 'pending'
  `;

  db.all(friendsQuery, [userId, userId, userId], (err, friends) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching friends' });
    }

    db.all(requestsQuery, [userId], (err, requests) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching requests' });
      }

      const excludeIds = [
        parseInt(userId),
        ...friends.map(f => f.friend_id),
        ...requests.map(r => r.receiver_id)
      ];

      const placeholders = excludeIds.map(() => '?').join(',');
      const searchQuery = `
        SELECT id, username, email, public_key, avatar_url, created_at 
        FROM users 
        WHERE username LIKE ? AND id NOT IN (${placeholders})
        LIMIT ? OFFSET ?
      `;

      db.all(
        searchQuery,
        [`%${query}%`, ...excludeIds, parseInt(limit), parseInt(offset)],
        (err, users) => {
          if (err) {
            return res.status(500).json({ error: 'Error searching users' });
          }
          res.json(users);
        }
      );
    });
  });
});

// Send friend request with note
router.post('/request', (req, res) => {
  const { senderId, receiverId, note } = req.body;

  if (!senderId || !receiverId) {
    return res.status(400).json({ error: 'Sender and receiver IDs are required' });
  }

  // Check if already friends or request exists
  db.get(
    'SELECT * FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = "pending"',
    [senderId, receiverId],
    (err, existingRequest) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      if (existingRequest) {
        return res.status(400).json({ error: 'Friend request already exists' });
      }

      db.run(
        'INSERT INTO friend_requests (sender_id, receiver_id, note, status) VALUES (?, ?, ?, ?)',
        [senderId, receiverId, note || '', 'pending'],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE')) {
              return res.status(400).json({ error: 'Friend request already sent' });
            }
            return res.status(500).json({ error: 'Error sending friend request' });
          }

          const requestId = this.lastID;

          // Get sender info to emit with the event
          db.get('SELECT id, username, email, public_key, avatar_url FROM users WHERE id = ?', [senderId], (err, sender) => {
            if (!err && sender && io) {
              // Emit socket event to receiver
              io.emit('new_friend_request', {
                requestId,
                sender,
                receiverId,
                note: note || ''
              });
            }
          });

          res.status(201).json({ id: requestId, message: 'Friend request sent' });
        }
      );
    }
  );
});

// Get pending friend requests for a user
router.get('/requests/:userId', (req, res) => {
  const { userId } = req.params;

  db.all(
    `SELECT fr.id, fr.sender_id, fr.note, fr.status, fr.created_at, u.username, u.email, u.avatar_url 
     FROM friend_requests fr
     JOIN users u ON fr.sender_id = u.id
     WHERE fr.receiver_id = ? AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [userId],
    (err, requests) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching friend requests' });
      }
      res.json(requests);
    }
  );
});

// Accept friend request
router.post('/accept', (req, res) => {
  const { requestId, userId } = req.body;

  if (!requestId || !userId) {
    return res.status(400).json({ error: 'Request ID and User ID are required' });
  }

  // Get request details first
  db.get('SELECT * FROM friend_requests WHERE id = ?', [requestId], (err, request) => {
    if (err) {
      console.error('Error fetching friend request:', err);
      return res.status(500).json({ error: 'Unable to process request' });
    }
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const user1_id = Math.min(request.sender_id, request.receiver_id);
    const user2_id = Math.max(request.sender_id, request.receiver_id);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('Transaction begin error:', err);
          return res.status(500).json({ error: 'Unable to process request' });
        }

        // Update friend request status
        db.run(
          'UPDATE friend_requests SET status = ? WHERE id = ?',
          ['accepted', requestId],
          (err) => {
            if (err) {
              console.error('Error updating request:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Unable to process request' });
            }

            // Add to friends table
            db.run(
              'INSERT INTO friends (user1_id, user2_id) VALUES (?, ?)',
              [user1_id, user2_id],
              (err) => {
                if (err) {
                  console.error('Error adding friend:', err);
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Unable to process request' });
                }

                db.run('COMMIT', (err) => {
                  if (err) {
                    console.error('Commit error:', err);
                    return res.status(500).json({ error: 'Unable to process request' });
                  }

                  // Emit socket event to sender
                  if (io) {
                    io.emit('request_accepted', {
                      requestId,
                      senderId: request.sender_id,
                      receiverId: request.receiver_id
                    });
                  }

                  res.json({ message: 'Friend request accepted' });
                });
              }
            );
          }
        );
      });
    });
  });
});

// Reject friend request
router.post('/reject', (req, res) => {
  const { requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  db.run(
    'UPDATE friend_requests SET status = ? WHERE id = ?',
    ['rejected', requestId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error rejecting request' });
      }
      res.json({ message: 'Friend request rejected' });
    }
  );
});

// Get friends list
router.get('/list/:userId', (req, res) => {
  const { userId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  db.all(
    `SELECT 
       u.id, 
       u.username, 
       u.email, 
       u.public_key, 
       u.avatar_url, 
       u.is_online, 
       u.last_seen,
       (SELECT COUNT(*) 
        FROM messages 
        WHERE sender_id = u.id 
          AND receiver_id = ? 
          AND status != 'read'
          AND (hidden_for_user_ids IS NULL OR hidden_for_user_ids NOT LIKE '%' || ? || '%')
       ) as unreadCount
     FROM friends f
     JOIN users u ON (f.user1_id = u.id OR f.user2_id = u.id)
     WHERE (f.user1_id = ? OR f.user2_id = ?) AND u.id != ?
     LIMIT ? OFFSET ?`,
    [userId, userId, userId, userId, userId, parseInt(limit), parseInt(offset)],
    (err, friends) => {
      if (err) {
        console.error('Error fetching friends:', err);
        return res.status(500).json({ error: 'Unable to load friends list' });
      }
      res.json(friends);
    }
  );
});

// Block user
router.post('/block', (req, res) => {
  const { blockerId, blockedId } = req.body;

  if (!blockerId || !blockedId) {
    return res.status(400).json({ error: 'Blocker and blocked user IDs are required' });
  }

  db.run(
    'INSERT INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)',
    [blockerId, blockedId],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'User already blocked' });
        }
        return res.status(500).json({ error: 'Error blocking user' });
      }

      // Emit socket event
      if (io) {
        io.emit('user_blocked', {
          blockerId,
          blockedId
        });
      }

      res.status(201).json({ message: 'User blocked successfully' });
    }
  );
});

// Unblock user
router.post('/unblock', (req, res) => {
  const { blockerId, blockedId } = req.body;

  if (!blockerId || !blockedId) {
    return res.status(400).json({ error: 'Blocker and blocked user IDs are required' });
  }

  db.run(
    'DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?',
    [blockerId, blockedId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error unblocking user' });
      }

      // Emit socket event
      if (io) {
        io.emit('user_unblocked', {
          blockerId,
          blockedId
        });
      }

      res.json({ message: 'User unblocked successfully' });
    }
  );
});

// Check if user is blocked
router.get('/block-status/:userId/:friendId', (req, res) => {
  const { userId, friendId } = req.params;

  db.get(
    `SELECT * FROM blocked_users 
     WHERE (blocker_id = ? AND blocked_id = ?) 
        OR (blocker_id = ? AND blocked_id = ?)`,
    [userId, friendId, friendId, userId],
    (err, block) => {
      if (err) {
        return res.status(500).json({ error: 'Error checking block status' });
      }

      if (block) {
        res.json({
          isBlocked: true,
          blockerId: block.blocker_id,
          blockedId: block.blocked_id
        });
      } else {
        res.json({ isBlocked: false });
      }
    }
  );
});

export default router;
