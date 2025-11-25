import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database with WAL mode for concurrency
const db = new sqlite3.Database(join(__dirname, '../truckoo.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    
    // CRITICAL: Enable WAL mode to prevent locking errors
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) {
        console.error('Error enabling WAL mode:', err.message);
      } else {
        console.log('WAL mode enabled for database concurrency');
      }
    });
  }
});

// Create tables with proper constraints
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      public_key TEXT,
      avatar_url TEXT,
      bio TEXT DEFAULT 'Hey there! I am using Connect.',
      last_seen DATETIME,
      is_online INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Friend requests table with UNIQUE constraint to prevent duplicates
  db.run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      note TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id),
      UNIQUE(sender_id, receiver_id)
    )
  `);

  // Friends table
  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id),
      UNIQUE(user1_id, user2_id)
    )
  `);

  // Blocked users table
  db.run(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blocker_id) REFERENCES users(id),
      FOREIGN KEY (blocked_id) REFERENCES users(id),
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  // Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      status TEXT DEFAULT 'sent',
      is_deleted INTEGER DEFAULT 0,
      is_edited INTEGER DEFAULT 0,
      is_disappearing INTEGER DEFAULT 0,
      reply_to_id INTEGER,
      hidden_for_user_ids TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,
      read_at DATETIME,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id),
      FOREIGN KEY (reply_to_id) REFERENCES messages(id)
    )
  `);

  // User sessions table for security dashboard
  db.run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      ip_address TEXT,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add is_edited column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding is_edited column:', err.message);
    }
  });

  // Add is_disappearing column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE messages ADD COLUMN is_disappearing INTEGER DEFAULT 0
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding is_disappearing column:', err.message);
    }
  });

  // Add public_key column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE users ADD COLUMN public_key TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding public_key column:', err.message);
    }
  });

  // Add reply_to_id column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE messages ADD COLUMN reply_to_id INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding reply_to_id column:', err.message);
    }
  });

  // Add type column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding type column:', err.message);
    }
  });

  // Add avatar_url column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE users ADD COLUMN avatar_url TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding avatar_url column:', err.message);
    }
  });

  // Add bio column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE users ADD COLUMN bio TEXT DEFAULT 'Hey there! I am using Connect.'
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding bio column:', err.message);
    }
  });

  // Add hidden_for_user_ids column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE messages ADD COLUMN hidden_for_user_ids TEXT DEFAULT ''
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding hidden_for_user_ids column:', err.message);
    }
  });

  console.log('Database tables created successfully');
});

export default db;
