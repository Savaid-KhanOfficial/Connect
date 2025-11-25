We are moving to **Phase 17: Sidebar Experience Upgrade (Sorting & Badges)**.

**Goal:** Sort the Sidebar so Online users appear at the top, and show WhatsApp-style "Unread Message Counts".

**Task 1: Backend - Fetch Unread Counts**
- Update `routes/friends.js` (endpoint `GET /api/friends/search` or your main chat list endpoint):
- **Query Modification:** When fetching the list of friends/chats:
  - Perform a sub-query or count to find the number of messages where:
    - `sender_id` = Friend's ID
    - `receiver_id` = Current User's ID
    - `status` != 'read' (or 'seen')
  - Add this value as `unreadCount` to the returned user objects.

**Task 2: Frontend - Sorting Logic (`Sidebar.jsx`)**
- Inside the Sidebar component, creating a `sortedChats` derived variable from your `chats` state.
- **Sort Logic:**
  1. **Primary:** `is_online` status. (Online users on TOP).
  2. **Secondary:** `unreadCount` (Users with unread messages higher).
  3. **Tertiary:** Alphabetical or Last Active.
- Use this `sortedChats` array for rendering the list.

**Task 3: Frontend - Badge UI**
- In the Sidebar List Item component:
  - Check if `user.unreadCount > 0`.
  - **Render:** A small, rounded pill/circle on the right side of the row.
  - **Style:** `bg-green-500` (or your Teal accent), `text-white`, `text-xs`, `font-bold`, `rounded-full`, `px-2`.
  - **Placement:** Usually sits below the timestamp or replaces the timestamp if space is tight.

**Task 4: Frontend - Real-Time Updates**
- In `Chat.jsx` (Socket Listener for `receive_message`):
  - **Logic:**
    - If the incoming message is from the `selectedUser` (currently open chat):
      - Emit `mark_read` immediately (no badge needed).
    - If the message is from someone **ELSE**:
      - Update the `chats` state: Find the sender and increment their `unreadCount += 1`.
      - (Optional) Move that user to the top of the list if you want "Recent Activity" sorting.

Please implement the Backend Count logic first, then the Frontend Sorting and Badges.