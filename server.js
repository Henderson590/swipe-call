const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', socket => {
  console.log('A user connected:', socket.id);

  socket.on('join', room => {
    socket.join(room);
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    const otherClient = clients.find(id => id !== socket.id);

    if (otherClient) {
      socket.to(otherClient).emit('new-peer', socket.id);
    }
  });

  socket.on('offer', (targetId, offer) => {
    io.to(targetId).emit('offer', socket.id, offer);
  });

  socket.on('answer', (targetId, answer) => {
    io.to(targetId).emit('answer', socket.id, answer);
  });

  socket.on('ice-candidate', (targetId, candidate) => {
    io.to(targetId).emit('ice-candidate', socket.id, candidate);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
