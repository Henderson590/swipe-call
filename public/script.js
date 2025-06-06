const socket = io();
let audioEnabled = true;
let videoEnabled = true;
let currentVideoDeviceId = null;
let availableCameras = [];


const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

async function joinRoom() {
  roomName = document.getElementById('roomInput').value;
  if (!roomName) return alert("Enter a room name.");

  const devices = await navigator.mediaDevices.enumerateDevices();
  availableCameras = devices.filter(d => d.kind === 'videoinput');
  if (availableCameras.length > 0) {
    currentVideoDeviceId = availableCameras[0].deviceId;
  }
    localStream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: currentVideoDeviceId ? { exact: currentVideoDeviceId } : undefined },
    audio: true
  });

  function toggleMic() {
    audioEnabled = !audioEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = audioEnabled;
    });
    }

    function toggleCamera() {
        videoEnabled = !videoEnabled;
        localStream.getVideoTracks().forEach(track => {
            track.enabled = videoEnabled;
        });
        }


  localVideo.srcObject = localStream;

  socket.emit('join', roomName);
}

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

  // Replace the video track in the peer connection
  const newVideoTrack = newStream.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
  if (sender) {
    sender.replaceTrack(newVideoTrack);
  }

  // Update the local stream and video element
  localStream.getTracks().forEach(track => track.stop());
  localStream = newStream;
  localVideo.srcObject = newStream;
  currentVideoDeviceId = nextDeviceId;
}

function hangUp() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  alert("Call ended.");
}


socket.on('new-peer', async (peerId) => {
  peerConnection = new RTCPeerConnection(config);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('ice-candidate', peerId, e.candidate);
    }
  };

  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', peerId, offer);
});

socket.on('offer', async (peerId, offer) => {
  peerConnection = new RTCPeerConnection(config);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('ice-candidate', peerId, e.candidate);
    }
  };

  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', peerId, answer);
});

socket.on('answer', async (peerId, answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async (peerId, candidate) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
  }
});

function toggleTheme() {
  document.body.classList.toggle('light-theme');
}
