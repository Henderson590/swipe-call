const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

const users = new Map(); // socket.id → username

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("login", (username) => {
    users.set(socket.id, username);
    updateUserList();
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    updateUserList();
  });

  function updateUserList() {
    const usernames = Array.from(users.values());
    io.emit("update-user-list", usernames);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
