let socket = io("https://video-call-server-g6b9.onrender.com");
let peerConnections = {}; // <--- Support multiple peers
let localStream;
let audioEnabled = true;
let videoEnabled = true;
let currentVideoDeviceId = null;
let availableCameras = [];
let username;
let roomName = "";
let allFriends = [];

// DOM elements
const localVideo = document.getElementById('localVideo');
const ringtone = document.getElementById('ringtone');
const friendsContainer = document.getElementById("friendsContainer");
const searchInput = document.getElementById("searchInput");
const remoteVideos = document.getElementById("remoteVideos");

// Login handler
function login() {
  username = document.getElementById("usernameInput").value.trim();
  if (!username) return alert("Enter a username!");

  socket.emit("login", username);

  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("usernameDisplay").textContent = username;

  socket.on("update-user-list", (users) => {
    allFriends = users.filter(user => user !== username);
    renderFriends(allFriends);
  });
}

function renderFriends(friends) {
  friendsContainer.innerHTML = "";
  friends.forEach(user => {
    const el = document.createElement("div");
    el.textContent = user;
    el.className = "friend";
    el.onclick = () => callUser(user);
    friendsContainer.appendChild(el);
  });
}

function searchFriends() {
  const term = searchInput.value.toLowerCase();
  const filtered = allFriends.filter(f => f.toLowerCase().includes(term));
  renderFriends(filtered);
}

// Join a room and initialize media
async function joinRoom() {
  roomName = document.getElementById("roomInput").value.trim();
  if (!roomName) return alert("Enter a room name.");

  const devices = await navigator.mediaDevices.enumerateDevices();
  availableCameras = devices.filter(d => d.kind === 'videoinput');
  currentVideoDeviceId = availableCameras[0]?.deviceId;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: currentVideoDeviceId ? { exact: currentVideoDeviceId } : undefined },
    audio: true
  });

  localVideo.srcObject = localStream;
  socket.emit('join', roomName);
}

// Toggle mic
function toggleMic() {
  audioEnabled = !audioEnabled;
  localStream.getAudioTracks().forEach(track => track.enabled = audioEnabled);
}

// Toggle camera
function toggleCamera() {
  videoEnabled = !videoEnabled;
  localStream.getVideoTracks().forEach(track => track.enabled = videoEnabled);
}

// Switch between front/rear cameras
async function switchCamera() {
  if (availableCameras.length < 2) {
    alert("No other camera available.");
    return;
  }

  const currentIndex = availableCameras.findIndex(d => d.deviceId === currentVideoDeviceId);
  const nextIndex = (currentIndex + 1) % availableCameras.length;
  const nextDeviceId = availableCameras[nextIndex].deviceId;

  const newStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: nextDeviceId } },
    audio: true
  });

  const newVideoTrack = newStream.getVideoTracks()[0];

  for (const peerId in peerConnections) {
    const sender = peerConnections[peerId].getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(newVideoTrack);
  }

  localStream.getTracks().forEach(track => track.stop());
  localStream = newStream;
  localVideo.srcObject = newStream;
  currentVideoDeviceId = nextDeviceId;
}

// Hang up
function hangUp() {
  ringtone.pause();
  ringtone.currentTime = 0;

  for (const peerId in peerConnections) {
    peerConnections[peerId].close();
    document.getElementById(`video-${peerId}`)?.remove();
  }

  peerConnections = {};

  if (localStream) localStream.getTracks().forEach(track => track.stop());
  localVideo.srcObject = null;
  remoteVideos.innerHTML = "";

  alert("Call ended.");
}

// Theme toggle
function toggleTheme() {
  document.body.classList.toggle('light-theme');
}

// Call a specific user
function callUser(targetUser) {
  ringtone.play().catch(err => console.warn("Auto-play blocked:", err));
  roomName = `${username}-${targetUser}`;
  joinRoom().then(() => {
    socket.emit("join", roomName);
  });
}

// Add new remote stream
function addRemoteStream(stream, peerId) {
  let existing = document.getElementById(`video-${peerId}`);
  if (existing) return;

  const video = document.createElement('video');
  video.id = `video-${peerId}`;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.style.width = "48%";
  video.style.borderRadius = "8px";
  video.style.backgroundColor = "#111";

  remoteVideos.appendChild(video);
}

// WebRTC config
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Handle new peer
socket.on('new-peer', async (peerId) => {
  const pc = new RTCPeerConnection(config);
  peerConnections[peerId] = pc;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('ice-candidate', peerId, e.candidate);
  };

  pc.ontrack = event => {
    addRemoteStream(event.streams[0], peerId);
    ringtone.pause();
    ringtone.currentTime = 0;
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('offer', peerId, offer);
});

// Handle offer
socket.on('offer', async (peerId, offer) => {
  ringtone.play().catch(() => {});
  const pc = new RTCPeerConnection(config);
  peerConnections[peerId] = pc;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = e => {
    if (e.candidate) socket.emit('ice-candidate', peerId, e.candidate);
  };

  pc.ontrack = event => {
    addRemoteStream(event.streams[0], peerId);
    ringtone.pause();
    ringtone.currentTime = 0;
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', peerId, answer);
});

// Handle answer
socket.on('answer', async (peerId, answer) => {
  const pc = peerConnections[peerId];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

// Handle ICE candidate
socket.on('ice-candidate', async (peerId, candidate) => {
  const pc = peerConnections[peerId];
  if (pc && candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }
});
