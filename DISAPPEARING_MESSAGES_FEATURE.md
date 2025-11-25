# 👻 Disappearing Messages Feature

## Overview
Phase 7 implementation of "Burn-on-Read" disappearing messages with a 5-minute auto-expiration timer.

## Features Implemented

### 1. **Auto-Expanding Textarea Input** ✅
- Replaced `<input>` with `<textarea>` for better UX
- Auto-resizes from 1 row to max 120px height
- **Enter**: Sends message
- **Shift+Enter**: Creates new line
- Smart height management with `autoResizeTextarea()` function

### 2. **Ghost Mode Toggle** ✅
- Purple button next to send button
- Toggle on/off for disappearing messages
- Dark charcoal styling when ghost mode is active:
  - Container: `bg-gray-800`
  - Textarea: `bg-gray-700 text-white`
  - Placeholder: "👻 Ghost message (disappears after 5 min)..."

### 3. **Backend Implementation** ✅

#### Database Schema
```sql
ALTER TABLE messages ADD COLUMN is_disappearing INTEGER DEFAULT 0
```

#### API Updates
- **POST /api/messages/send**
  - Accepts `isDisappearing` field from request body
  - Saves to database as `is_disappearing` (1 or 0)

#### Expiration Timer Logic
- **POST /api/messages/mark-read**
  - Queries for disappearing messages being marked as read
  - Starts 5-minute timer (300,000ms) for each message
  - After timer expires:
    - Updates message: `message = 'Message expired'`, `is_deleted = 1`
    - Emits `message_expired` socket event to both users

### 4. **Frontend Display** ✅

#### Message Bubbles
- Purple ghost icon (👻) displayed next to timestamp for disappearing messages
- Icon visible to both sender and receiver
- Shows `is_disappearing === 1` status

#### Expired Messages
- Display italic gray text: "Message expired"
- Shows when `is_deleted === 1` and was a disappearing message

#### Socket Event Handling
- New listener: `message_expired`
- Updates message state in real-time when messages expire
- Both sender and receiver see expiration simultaneously

## Technical Details

### Frontend (ChatWindow.jsx)
```jsx
// State
const [isGhostMode, setIsGhostMode] = useState(false);
const textareaRef = useRef(null);

// Auto-resize function
const autoResizeTextarea = () => {
  if (textareaRef.current) {
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
  }
};

// Send with disappearing flag
const messageData = {
  sender_id: user.id,
  receiver_id: friend.id,
  message: newMessage.trim(),
  isDisappearing: isGhostMode
};

// Handle expiration event
const handleMessageExpired = (data) => {
  setMessages(prev => prev.map(msg => 
    msg.id === data.messageId 
      ? { ...msg, message: 'Message expired', is_deleted: 1 }
      : msg
  ));
};
```

### Backend (routes/messages.js)
```javascript
// Send with disappearing field
db.run(
  'INSERT INTO messages (sender_id, receiver_id, message, status, is_disappearing) VALUES (?, ?, ?, ?, ?)',
  [senderId, receiverId, message, 'sent', isDisappearing ? 1 : 0],
  // ...
);

// Mark-read with timer logic
db.all(
  `SELECT id FROM messages 
   WHERE receiver_id = ? AND sender_id = ? AND status != 'read' AND is_disappearing = 1`,
  [userId, friendId],
  (err, disappearingMessages) => {
    // Update to read status
    // Start 5-minute timers
    disappearingMessages.forEach(msg => {
      setTimeout(() => {
        db.run(
          `UPDATE messages SET message = 'Message expired', is_deleted = 1 WHERE id = ?`,
          [msg.id],
          // Emit message_expired event
        );
      }, 5 * 60 * 1000);
    });
  }
);
```

## Socket Events

### New Event: `message_expired`
**Server → Client**
```javascript
{
  messageId: number,
  senderId: number,
  receiverId: number
}
```

**Purpose**: Notifies both users when a disappearing message expires after being read for 5 minutes.

## User Experience Flow

1. **Sending Disappearing Message**:
   - User clicks ghost button (turns purple)
   - Types message in dark input field
   - Sends message with ghost flag enabled

2. **Receiving Disappearing Message**:
   - Message appears normally in chat
   - Purple ghost icon (👻) visible next to timestamp
   - Indicates "this message will disappear"

3. **Reading & Expiration**:
   - When receiver opens chat, messages marked as read
   - 5-minute countdown starts silently in backend
   - After 5 minutes: Message content replaced with "Message expired"
   - Both users see expired message simultaneously
   - Ghost icon remains visible

## Security & Privacy Notes

- Messages expire **after being read** (not just sent)
- Timer starts only when receiver marks messages as read
- Original message content permanently replaced in database
- No way to recover expired messages
- Both parties notified when message expires (real-time)

## Testing Checklist

- [x] Ghost mode toggle works
- [x] Textarea auto-expands correctly
- [x] Enter sends, Shift+Enter creates new line
- [x] Dark styling when ghost mode active
- [x] Messages save with is_disappearing flag
- [x] Ghost icon displays on messages
- [x] Timer starts when messages marked as read
- [x] Messages expire after 5 minutes
- [x] Both users see "Message expired" text
- [x] Socket events work in real-time

## Files Modified

### Frontend
- `client/src/components/ChatWindow.jsx`
  - Added ghost mode state and toggle UI
  - Implemented textarea with auto-resize
  - Added message_expired socket listener
  - Display ghost icon on disappearing messages

### Backend
- `server/src/database.js`
  - Added is_disappearing column migration
  - Updated messages table schema

- `server/src/routes/messages.js`
  - Updated POST /send to accept isDisappearing
  - Implemented timer logic in POST /mark-read
  - Added message_expired socket emission

## Future Enhancements (Optional)

- [ ] Visual countdown timer in UI
- [ ] Customizable expiration duration (1min, 5min, 1hour)
- [ ] Notification when message is about to expire
- [ ] Option to extend timer before expiration
- [ ] Statistics: "X messages will expire soon"
- [ ] Disable editing for disappearing messages
- [ ] Self-destructing photos/files

---

**Status**: ✅ Fully Implemented  
**Phase**: 7 - Advanced Privacy & UX Features  
**Date**: January 2025
