# Connect 💬

A modern, secure real-time chat application with end-to-end encryption, voice messages, and advanced privacy features.

## ✨ Features

### 🔐 Security & Privacy
- **End-to-End Encryption (E2EE)**: RSA-2048 + AES-GCM encryption for all messages
- **Ghost Mode**: Hide specific chats from your chat list while staying active
- **Disappearing Messages**: Auto-delete messages after 24 hours, 7 days, or 90 days
- **Delete for Everyone**: Remove sent messages from all participants

### 💬 Communication
- **Real-time Messaging**: Instant message delivery with Socket.IO
- **Voice Messages**: Record and send audio messages with waveform visualization
- **File Sharing**: Send images, documents, and files with preview support
- **Emoji Support**: Rich emoji picker with search functionality
- **Message Status**: Delivered and read indicators

### 👥 Social Features
- **Friend System**: Send, accept, or reject friend requests
- **Online Status**: Real-time presence indicators
- **Unread Badges**: WhatsApp-style notification badges
- **Smart Sorting**: Sidebar sorted by online status, unread messages, and alphabetically

### 🎨 User Experience
- **Profile Customization**: Custom avatars and bios
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS
- **Toast Notifications**: Non-intrusive alerts for important events
- **Chat Persistence**: Maintains active chat across page refreshes

## 🚀 Tech Stack

### Frontend
- **React 18.2** with Vite
- **Socket.IO Client** for real-time communication
- **TailwindCSS** for styling
- **Lucide React** for icons
- **crypto-js** for encryption
- **emoji-picker-react** for emoji support

### Backend
- **Node.js** with Express.js
- **Socket.IO** for WebSocket connections
- **SQLite3** for data persistence
- **Multer** for file uploads
- **Helmet** for security headers
- **Rate Limiting** for API protection

## 📦 Installation

### Prerequisites
- Node.js 16+ and npm
- Git

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/Savaid-KhanOfficial/Connect.git
cd Connect
```

2. **Install dependencies**
```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

3. **Configure environment**
```bash
# In server directory, create .env file
cd server
cp .env.example .env
# Edit .env and set your PORT (default: 3000)
```

4. **Run the application**
```bash
# From root directory, run both client and server
npm run dev

# Or run separately:
# Terminal 1 - Server
npm run server

# Terminal 2 - Client
npm run client
```

5. **Access the application**
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

## 🔧 Configuration

### Server (.env)
```env
PORT=3000
NODE_ENV=development
```

### Client
- Default server URL: `http://localhost:3000`
- Configured in `client/src/App.jsx`

## 📱 Usage

1. **Sign Up**: Create an account with username, email, and password
2. **Add Friends**: Search for users and send friend requests
3. **Start Chatting**: Accept friend requests and begin secure conversations
4. **Voice Messages**: Hold the microphone button to record, release to send
5. **Send Files**: Click the paperclip icon to attach images or documents
6. **Privacy Settings**: Enable Ghost Mode or Disappearing Messages from the 3-dot menu

## 🏗️ Project Structure

```
Connect/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── utils/         # Utility functions (crypto, etc.)
│   │   └── main.jsx       # Entry point
│   └── public/            # Static assets
├── server/                # Node.js backend
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── socket/        # Socket.IO handlers
│   │   ├── utils/         # Utilities (logger, etc.)
│   │   ├── database.js    # Database initialization
│   │   └── server.js      # Express server
│   └── uploads/           # User-uploaded files (gitignored)
└── package.json           # Root package configuration
```

## 🔒 Security Features

- **Password Hashing**: bcrypt with salt rounds
- **Rate Limiting**: Prevents brute force attacks
- **CORS Protection**: Configured origins
- **XSS Prevention**: Helmet.js security headers
- **SQL Injection Protection**: Parameterized queries
- **File Upload Validation**: Type and size restrictions

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the ISC License.

## 👨‍💻 Author

**Savaid Khan**
- GitHub: [@Savaid-KhanOfficial](https://github.com/Savaid-KhanOfficial)
- Email: savaid.khan.official@gmail.com

## 🙏 Acknowledgments

- Socket.IO for real-time communication
- React team for the amazing framework
- TailwindCSS for the utility-first CSS framework

---

Made with ❤️ by Savaid Khan