import express from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import db from '../database.js';

const router = express.Router();

// Rate limiter for auth endpoints (5 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Signup
router.post('/signup', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Server-side password validation
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (password.length > 128) {
    return res.status(400).json({ error: 'Password is too long' });
  }

  // Sanitize inputs to prevent XSS
  const sanitizedUsername = validator.escape(username.trim());
  const sanitizedEmail = validator.normalizeEmail(email.trim());

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [sanitizedUsername, sanitizedEmail, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: 'Error creating user' });
        }
        
        res.status(201).json({
          id: this.lastID,
          username: sanitizedUsername,
          email: sanitizedEmail
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Parse user agent to get device name
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      let deviceName = 'Unknown Device';
      
      // Extract browser and OS info
      if (userAgent.includes('Chrome')) deviceName = 'Chrome';
      else if (userAgent.includes('Firefox')) deviceName = 'Firefox';
      else if (userAgent.includes('Safari')) deviceName = 'Safari';
      else if (userAgent.includes('Edge')) deviceName = 'Edge';
      
      if (userAgent.includes('Windows')) deviceName += ' on Windows';
      else if (userAgent.includes('Mac')) deviceName += ' on Mac';
      else if (userAgent.includes('Linux')) deviceName += ' on Linux';
      else if (userAgent.includes('Android')) deviceName += ' on Android';
      else if (userAgent.includes('iOS')) deviceName += ' on iOS';

      // Get IP address
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;

      // Insert session record
      db.run(
        'INSERT INTO user_sessions (user_id, device_name, ip_address) VALUES (?, ?, ?)',
        [user.id, deviceName, ipAddress],
        (err) => {
          if (err) {
            console.error('Error creating session:', err);
          }
        }
      );

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        public_key: user.public_key,
        avatar_url: user.avatar_url,
        bio: user.bio
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// Save public key
router.post('/public-key', (req, res) => {
  const { userId, publicKey } = req.body;

  if (!userId || !publicKey) {
    return res.status(400).json({ error: 'User ID and public key are required' });
  }

  db.run(
    'UPDATE users SET public_key = ? WHERE id = ?',
    [publicKey, userId],
    function(err) {
      if (err) {
        console.error('Error saving public key:', err);
        return res.status(500).json({ error: 'Error saving public key' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: 'Public key saved successfully' });
    }
  );
});

export default router;
