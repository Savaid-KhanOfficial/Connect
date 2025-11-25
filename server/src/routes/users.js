import express from 'express';
import multer from 'multer';
import validator from 'validator';
import db from '../database.js';

const router = express.Router();

// Configure multer for in-memory storage (secure Base64 approach)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit (reduced from 5MB)
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'));
    }
  }
});

// Get all users with pagination (batches of 20)
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  db.all(
    'SELECT id, username, email, created_at FROM users LIMIT ? OFFSET ?',
    [limit, offset],
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: 'Error fetching users' });
      }
      res.json(users);
    }
  );
});

// Search users by username
router.get('/search', (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  db.all(
    'SELECT id, username, email, public_key, avatar_url FROM users WHERE username LIKE ? LIMIT 20',
    [`%${query}%`],
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: 'Error searching users' });
      }
      res.json(users);
    }
  );
});

// Update user profile (avatar and bio)
router.put('/profile', (req, res) => {
  const { userId, bio, avatarUrl } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Build dynamic update query based on provided fields
  const updates = [];
  const params = [];

  // Whitelist of allowed fields to prevent SQL injection
  const allowedFields = { bio: true, avatar_url: true };

  if (bio !== undefined) {
    if (!allowedFields.bio) {
      return res.status(400).json({ error: 'Invalid field' });
    }
    // Validate bio length
    if (bio.length > 150) {
      return res.status(400).json({ error: 'Bio must be 150 characters or less' });
    }
    // Sanitize bio to prevent XSS
    const sanitizedBio = validator.escape(bio.trim());
    updates.push('bio = ?');
    params.push(sanitizedBio);
  }

  if (avatarUrl !== undefined) {
    if (!allowedFields.avatar_url) {
      return res.status(400).json({ error: 'Invalid field' });
    }
    updates.push('avatar_url = ?');
    params.push(avatarUrl);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(userId);

  db.run(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    params,
    function(err) {
      if (err) {
        console.error('Error updating profile:', err);
        return res.status(500).json({ error: 'Error updating profile' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Fetch updated user data
      db.get(
        'SELECT id, username, email, avatar_url, bio FROM users WHERE id = ?',
        [userId],
        (err, user) => {
          if (err) {
            return res.status(500).json({ error: 'Error fetching updated profile' });
          }
          res.json(user);
        }
      );
    }
  );
});

// Secure avatar upload endpoint (Base64 Data URI)
router.put('/avatar', upload.single('avatar'), (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Convert buffer to Base64 Data URI
    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    
    console.log(`[AVATAR] Uploading Base64 avatar for user ${userId} (${Math.round(base64Image.length / 1024)}KB)`);

    // Update database with Base64 string
    db.run(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [base64Image, userId],
      function(err) {
        if (err) {
          console.error('Error updating avatar:', err);
          return res.status(500).json({ error: 'Error updating avatar' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        console.log(`[AVATAR] Successfully updated avatar for user ${userId}`);
        res.json({ 
          message: 'Avatar updated successfully',
          avatar_url: base64Image 
        });
      }
    );
  } catch (error) {
    console.error('Error processing avatar:', error);
    res.status(500).json({ error: 'Error processing avatar' });
  }
});

// Get all active sessions for a user
router.get('/sessions/:userId', (req, res) => {
  const { userId } = req.params;

  db.all(
    'SELECT id, device_name, ip_address, last_active, created_at FROM user_sessions WHERE user_id = ? ORDER BY last_active DESC',
    [userId],
    (err, sessions) => {
      if (err) {
        console.error('Error fetching sessions:', err);
        return res.status(500).json({ error: 'Error fetching sessions' });
      }
      res.json(sessions);
    }
  );
});

// Delete a specific session (remote logout)
router.delete('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  db.run(
    'DELETE FROM user_sessions WHERE id = ?',
    [sessionId],
    function(err) {
      if (err) {
        console.error('Error deleting session:', err);
        return res.status(500).json({ error: 'Error deleting session' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ message: 'Session deleted successfully' });
    }
  );
});

export default router;
