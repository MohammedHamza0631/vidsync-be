const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// In-memory room storage
const rooms = {};

// Helper to generate unique room IDs
function generateRoomId() {
  return Math.random().toString(36).substr(2, 6);
}

// Create Room endpoint
app.post('/api/create-room', (req, res) => {
  const { videoId } = req.body;
  if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
    return res.status(400).json({ error: 'Invalid YouTube video ID.' });
  }
  const roomId = generateRoomId();
  
  // Create room immediately to ensure it's available for future requests
  rooms[roomId] = {
    videoId,
    state: {
      playing: false,
      currentTime: 0
    },
    users: [],
    createdAt: Date.now()
  };
  
  // Respond after ensuring the room is stored in memory
  res.json({ roomId });
});

// Validate Room endpoint
app.get('/api/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (!rooms[roomId]) {
    return res.status(404).json({ error: 'Room not found.' });
  }
  res.json({ videoId: rooms[roomId].videoId });
});

// Socket.io events
io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId }) => {
    if (!rooms[roomId]) {
      socket.emit('error', 'Room does not exist.');
      return;
    }
    socket.join(roomId);
    rooms[roomId].users.push(socket.id);
    // Send current state to new user
    socket.emit('video-state', rooms[roomId].state);
    // Notify others
    socket.to(roomId).emit('user-joined', { userId: socket.id });

    // Video state changes
    socket.on('video-state-change', (data) => {
      // Update state and broadcast
      rooms[roomId].state = { ...rooms[roomId].state, ...data };
      socket.to(roomId).emit('video-state', rooms[roomId].state);
    });

    socket.on('disconnect', () => {
      rooms[roomId].users = rooms[roomId].users.filter((id) => id !== socket.id);
      socket.to(roomId).emit('user-left', { userId: socket.id });
      // Optional: delete room if empty
      if (rooms[roomId].users.length === 0) delete rooms[roomId];
    });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
