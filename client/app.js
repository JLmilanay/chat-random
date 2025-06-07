// Determine the Socket.IO server URL based on environment
const SOCKET_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : window.location.origin;

const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    path: '/socket.io',
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const nextButton = document.getElementById('nextButton');
const reportButton = document.getElementById('reportButton');
const statusMessage = document.getElementById('statusMessage');
const chatInput = document.getElementById('chatInput');
const sendMessage = document.getElementById('sendMessage');
const chatMessages = document.getElementById('chatMessages');
const toggleVideo = document.getElementById('toggleVideo');
const toggleAudio = document.getElementById('toggleAudio');
const videoMode = document.getElementById('videoMode');
const voiceMode = document.getElementById('voiceMode');
const textMode = document.getElementById('textMode');

let localStream;
let peerConnection;
let currentPartnerId;
let isConnecting = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let currentMode = 'video';
let isVideoEnabled = true;
let isAudioEnabled = true;
let isReconnecting = false;

// WebRTC configuration with multiple STUN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// Socket.IO event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    statusMessage.textContent = 'Connected to server';
    if (isReconnecting) {
        isReconnecting = false;
        initializeWebRTC();
    }
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    statusMessage.textContent = 'Connection error. Retrying...';
    showError('Connection Error', 'Failed to connect to server. Retrying...');
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    statusMessage.textContent = 'Disconnected from server. Reconnecting...';
    isReconnecting = true;
});

socket.on('error', ({ message }) => {
    console.error('Server error:', message);
    showError('Server Error', message);
});

// Initialize WebRTC
async function initializeWebRTC() {
    try {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        if (currentMode !== 'text') {
            constraints.video = currentMode === 'video' ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user',
                frameRate: { ideal: 30 }
            } : false;
        }

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (currentMode !== 'text') {
            localVideo.srcObject = localStream;
            updateVideoVisibility();
        }
        
        enableControls();
        statusMessage.textContent = 'Waiting for a partner...';
        socket.emit('join', { mode: currentMode });
    } catch (error) {
        console.error('Error accessing media devices:', error);
        statusMessage.textContent = 'Error accessing camera and microphone. Please check permissions.';
        showError('Camera/Microphone Error', 'Please ensure you have granted camera and microphone permissions.');
        disableControls();
    }
}

// Update video visibility based on mode
function updateVideoVisibility() {
    const videoContainer = document.querySelector('.video-container');
    if (currentMode === 'text') {
        videoContainer.style.display = 'none';
    } else {
        videoContainer.style.display = 'grid';
        if (currentMode === 'voice') {
            localVideo.style.display = 'none';
            remoteVideo.style.display = 'none';
        } else {
            localVideo.style.display = 'block';
            remoteVideo.style.display = 'block';
        }
    }
}

// Create peer connection
function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream if not in text mode
    if (currentMode !== 'text' && localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: currentPartnerId,
                candidate: event.candidate
            });
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        switch(peerConnection.connectionState) {
            case 'connected':
                statusMessage.textContent = 'Connected!';
                connectionAttempts = 0;
                break;
            case 'disconnected':
            case 'failed':
                handleConnectionFailure();
                break;
            case 'closed':
                console.log('Peer connection closed');
                break;
        }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        switch(peerConnection.iceConnectionState) {
            case 'connected':
                console.log('ICE connected');
                break;
            case 'disconnected':
            case 'failed':
                handleConnectionFailure();
                break;
        }
    };

    // Handle incoming stream
    peerConnection.ontrack = event => {
        if (currentMode !== 'text') {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    return peerConnection;
}

// Handle connection failure
function handleConnectionFailure() {
    if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
        connectionAttempts++;
        statusMessage.textContent = `Connection lost. Reconnecting... (${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})`;
        reconnect();
    } else {
        statusMessage.textContent = 'Connection failed. Please try again.';
        showError('Connection Error', 'Failed to establish connection. Please try again.');
        resetConnection();
    }
}

// Reconnect attempt
function reconnect() {
    if (peerConnection) {
        peerConnection.close();
    }
    createPeerConnection();
    socket.emit('join', { mode: currentMode });
}

// Reset connection
function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (currentMode !== 'text') {
        remoteVideo.srcObject = null;
    }
    connectionAttempts = 0;
    socket.emit('join', { mode: currentMode });
}

// Show error modal
function showError(title, message) {
    const modal = document.createElement('div');
    modal.className = 'error-modal';
    modal.innerHTML = `
        <div class="error-content">
            <h3>${title}</h3>
            <p>${message}</p>
            <button onclick="this.parentElement.parentElement.remove()">OK</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// Add message to chat
function addMessage(message, isSent = false) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Enable/disable controls
function enableControls() {
    startButton.disabled = true;
    nextButton.disabled = false;
    reportButton.disabled = false;
    chatInput.disabled = false;
    sendMessage.disabled = false;
    toggleVideo.disabled = false;
    toggleAudio.disabled = false;
}

function disableControls() {
    startButton.disabled = false;
    nextButton.disabled = true;
    reportButton.disabled = true;
    chatInput.disabled = true;
    sendMessage.disabled = true;
    toggleVideo.disabled = true;
    toggleAudio.disabled = true;
}

// Handle WebRTC signaling
socket.on('offer', async ({ offer, sender }) => {
    if (isConnecting) return;
    isConnecting = true;
    currentPartnerId = sender;
    const pc = createPeerConnection();
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', {
            target: sender,
            answer: answer
        });
    } catch (error) {
        console.error('Error handling offer:', error);
        showError('Connection Error', 'Failed to establish connection. Please try again.');
    } finally {
        isConnecting = false;
    }
});

socket.on('answer', async ({ answer }) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
        showError('Connection Error', 'Failed to establish connection. Please try again.');
    }
});

socket.on('ice-candidate', async ({ candidate }) => {
    try {
        if (peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Handle matching
socket.on('matched', ({ partnerId }) => {
    currentPartnerId = partnerId;
    statusMessage.textContent = 'Partner found!';
});

socket.on('partner-left', () => {
    statusMessage.textContent = 'Partner left. Finding new partner...';
    resetConnection();
});

// Handle chat messages
socket.on('chat-message', ({ message }) => {
    addMessage(message, false);
});

// Event listeners
startButton.addEventListener('click', initializeWebRTC);

nextButton.addEventListener('click', () => {
    socket.emit('next');
    statusMessage.textContent = 'Finding new partner...';
});

reportButton.addEventListener('click', () => {
    if (currentPartnerId) {
        socket.emit('report', { reportedId: currentPartnerId });
        statusMessage.textContent = 'User reported. Finding new partner...';
        resetConnection();
    }
});

sendMessage.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message && currentPartnerId) {
        socket.emit('chat-message', { target: currentPartnerId, message });
        addMessage(message, true);
        chatInput.value = '';
    }
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage.click();
    }
});

toggleVideo.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            isVideoEnabled = !isVideoEnabled;
            videoTrack.enabled = isVideoEnabled;
            toggleVideo.textContent = isVideoEnabled ? 'Disable Video' : 'Enable Video';
        }
    }
});

toggleAudio.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
            toggleAudio.textContent = isAudioEnabled ? 'Mute' : 'Unmute';
        }
    }
});

// Mode selection
function setMode(mode) {
    if (mode === currentMode) return;
    
    currentMode = mode;
    videoMode.classList.toggle('active', mode === 'video');
    voiceMode.classList.toggle('active', mode === 'voice');
    textMode.classList.toggle('active', mode === 'text');
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    updateVideoVisibility();
    resetConnection();
}

videoMode.addEventListener('click', () => setMode('video'));
voiceMode.addEventListener('click', () => setMode('voice'));
textMode.addEventListener('click', () => setMode('text'));

// Initialize
disableControls();
setMode('video'); 