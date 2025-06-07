// Determine the Socket.IO server URL based on environment
const SOCKET_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : window.location.origin;

const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    path: '/socket.io'
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

// WebRTC configuration with multiple STUN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// Initialize WebRTC
async function initializeWebRTC() {
    try {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        };

        if (currentMode !== 'text') {
            constraints.video = currentMode === 'video' ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } : false;
        }

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (currentMode !== 'text') {
            localVideo.srcObject = localStream;
            updateVideoVisibility();
        }
        
        startButton.disabled = true;
        nextButton.disabled = false;
        reportButton.disabled = false;
        chatInput.disabled = false;
        sendMessage.disabled = false;
        statusMessage.textContent = 'Waiting for a partner...';
        socket.emit('join', { mode: currentMode });
    } catch (error) {
        console.error('Error accessing media devices:', error);
        statusMessage.textContent = 'Error accessing camera and microphone. Please check permissions.';
        showError('Camera/Microphone Error', 'Please ensure you have granted camera and microphone permissions.');
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
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Handle matching
socket.on('matched', ({ partnerId }) => {
    currentPartnerId = partnerId;
    statusMessage.textContent = 'Connected!';
    createPeerConnection();
});

// Handle partner leaving
socket.on('partner-left', () => {
    statusMessage.textContent = 'Partner left. Waiting for new connection...';
    resetConnection();
});

// Handle being reported
socket.on('reported', () => {
    showError('Warning', 'You have been reported. Please be respectful of other users.');
});

// Handle chat messages
socket.on('chat-message', ({ message }) => {
    addMessage(message, false);
});

// Button event listeners
startButton.addEventListener('click', initializeWebRTC);

nextButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (currentMode !== 'text') {
        remoteVideo.srcObject = null;
    }
    statusMessage.textContent = 'Looking for a new partner...';
    socket.emit('next');
});

reportButton.addEventListener('click', () => {
    if (currentPartnerId) {
        socket.emit('report', { reportedId: currentPartnerId });
        statusMessage.textContent = 'User reported. Finding new partner...';
        socket.emit('next');
    }
});

// Chat input handling
sendMessage.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message && currentPartnerId) {
        socket.emit('chat-message', {
            target: currentPartnerId,
            message: message
        });
        addMessage(message, true);
        chatInput.value = '';
    }
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage.click();
    }
});

// Media control buttons
toggleVideo.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            isVideoEnabled = !isVideoEnabled;
            videoTrack.enabled = isVideoEnabled;
            toggleVideo.innerHTML = `<i class="fas fa-video${isVideoEnabled ? '' : '-slash'}"></i>`;
            toggleVideo.classList.toggle('muted', !isVideoEnabled);
        }
    }
});

toggleAudio.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
            toggleAudio.innerHTML = `<i class="fas fa-microphone${isAudioEnabled ? '' : '-slash'}"></i>`;
            toggleAudio.classList.toggle('muted', !isAudioEnabled);
        }
    }
});

// Mode selection
function setMode(mode) {
    currentMode = mode;
    videoMode.classList.toggle('active', mode === 'video');
    voiceMode.classList.toggle('active', mode === 'voice');
    textMode.classList.toggle('active', mode === 'text');
    updateVideoVisibility();
}

videoMode.addEventListener('click', () => setMode('video'));
voiceMode.addEventListener('click', () => setMode('voice'));
textMode.addEventListener('click', () => setMode('text'));

// Handle connection errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    statusMessage.textContent = 'Connection error. Please try again.';
    showError('Connection Error', 'Failed to connect to the server. Please refresh the page.');
});

// Handle reconnection
socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    statusMessage.textContent = 'Reconnected!';
});

// Handle reconnection attempts
socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('Reconnection attempt', attemptNumber);
    statusMessage.textContent = `Reconnecting... (Attempt ${attemptNumber})`;
});

// Handle reconnection errors
socket.on('reconnect_error', (error) => {
    console.error('Reconnection error:', error);
    statusMessage.textContent = 'Reconnection failed. Please refresh the page.';
});

// Handle reconnection failures
socket.on('reconnect_failed', () => {
    console.error('Reconnection failed');
    statusMessage.textContent = 'Connection lost. Please refresh the page.';
    showError('Connection Error', 'Failed to reconnect to the server. Please refresh the page.');
}); 