import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'truckoo.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to database');
});

console.log('🧹 Starting database cleanup...\n');

// Delete all data from all tables
db.serialize(() => {
  // Delete messages
  db.run('DELETE FROM messages', function(err) {
    if (err) {
      console.error('Error deleting messages:', err);
    } else {
      console.log(`✅ Deleted ${this.changes} messages`);
    }
  });

  // Delete friend requests
  db.run('DELETE FROM friend_requests', function(err) {
    if (err) {
      console.error('Error deleting friend requests:', err);
    } else {
      console.log(`✅ Deleted ${this.changes} friend requests`);
    }
  });

  // Delete friends
  db.run('DELETE FROM friends', function(err) {
    if (err) {
      console.error('Error deleting friends:', err);
    } else {
      console.log(`✅ Deleted ${this.changes} friend relationships`);
    }
  });

  // Delete blocked users
  db.run('DELETE FROM blocked_users', function(err) {
    if (err) {
      console.error('Error deleting blocked users:', err);
    } else {
      console.log(`✅ Deleted ${this.changes} blocked relationships`);
    }
  });

  // Delete user sessions
  db.run('DELETE FROM user_sessions', function(err) {
    if (err) {
      console.error('Error deleting user sessions:', err);
    } else {
      console.log(`✅ Deleted ${this.changes} user sessions`);
    }
  });

  // Delete users
  db.run('DELETE FROM users', function(err) {
    if (err) {
      console.error('Error deleting users:', err);
    } else {
      console.log(`✅ Deleted ${this.changes} users`);
    }
  });

  // Reset auto-increment counters
  db.run('DELETE FROM sqlite_sequence', function(err) {
    if (err) {
      console.error('Error resetting sequences:', err);
    } else {
      console.log(`✅ Reset auto-increment sequences`);
    }
    
    // Close database and exit
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
      console.log('\n🎉 Database cleanup complete! Ready for fresh testing.');
      process.exit(0);
    });
  });
});
