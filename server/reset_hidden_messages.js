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

// Reset hidden_for_user_ids to empty string for all messages
db.run(`UPDATE messages SET hidden_for_user_ids = '' WHERE hidden_for_user_ids IS NOT NULL`, function(err) {
  if (err) {
    console.error('Error resetting column:', err);
    process.exit(1);
  }
  console.log(`✅ Reset hidden_for_user_ids for ${this.changes} messages`);
  
  // Verify the reset
  db.get(`SELECT COUNT(*) as count FROM messages WHERE hidden_for_user_ids != ''`, (err, row) => {
    if (err) {
      console.error('Error verifying:', err);
    } else {
      console.log(`✅ Messages with non-empty hidden_for_user_ids: ${row.count}`);
    }
    db.close();
  });
});
