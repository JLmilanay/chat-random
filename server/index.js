const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure CORS for Vercel deployment
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://chat-random.vercel.app', 'https://*.vercel.app']
    : ['http://localhost:3000', 'http://localhost:5000'];

const io = socketIO(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client')));
}

// Store waiting users and active connections
const waitingUsers = new Map(); // Map of socket.id to user mode
const activeConnections = new Map();
const userStats = new Map();

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REPORTS = 5;
const MAX_MESSAGES_PER_MINUTE = 30;

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    userStats.set(socket.id, {
        reports: 0,
        lastReportTime: Date.now(),
        messagesSent: 0,
        lastMessageTime: Date.now()
    });

    // Add user to waiting queue
    socket.on('join', ({ mode }) => {
        try {
            if (!isRateLimited(socket.id)) {
                waitingUsers.set(socket.id, mode || 'video');
                matchUsers();
            }
        } catch (error) {
            console.error('Error in join:', error);
            socket.emit('error', { message: 'Failed to join queue' });
        }
    });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        try {
            if (activeConnections.has(socket.id)) {
                io.to(data.target).emit('offer', {
                    offer: data.offer,
                    sender: socket.id
                });
            }
        } catch (error) {
            console.error('Error in offer:', error);
            socket.emit('error', { message: 'Failed to send offer' });
        }
    });

    socket.on('answer', (data) => {
        try {
            if (activeConnections.has(socket.id)) {
                io.to(data.target).emit('answer', {
                    answer: data.answer,
                    sender: socket.id
                });
            }
        } catch (error) {
            console.error('Error in answer:', error);
            socket.emit('error', { message: 'Failed to send answer' });
        }
    });

    socket.on('ice-candidate', (data) => {
        try {
            if (activeConnections.has(socket.id)) {
                io.to(data.target).emit('ice-candidate', {
                    candidate: data.candidate,
                    sender: socket.id
                });
            }
        } catch (error) {
            console.error('Error in ice-candidate:', error);
            socket.emit('error', { message: 'Failed to send ICE candidate' });
        }
    });

    // Handle "Next" button click
    socket.on('next', () => {
        try {
            const partnerId = activeConnections.get(socket.id);
            if (partnerId) {
                io.to(partnerId).emit('partner-left');
                activeConnections.delete(partnerId);
                activeConnections.delete(socket.id);
                waitingUsers.set(socket.id, waitingUsers.get(socket.id) || 'video');
                matchUsers();
            }
        } catch (error) {
            console.error('Error in next:', error);
            socket.emit('error', { message: 'Failed to find next partner' });
        }
    });

    // Handle chat messages
    socket.on('chat-message', ({ target, message }) => {
        try {
            const stats = userStats.get(socket.id);
            if (stats && canSendMessage(socket.id)) {
                stats.messagesSent++;
                stats.lastMessageTime = Date.now();
                io.to(target).emit('chat-message', { message });
            } else {
                socket.emit('error', { message: 'Message rate limit exceeded' });
            }
        } catch (error) {
            console.error('Error in chat-message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle reporting
    socket.on('report', ({ reportedId }) => {
        try {
            if (canReport(socket.id)) {
                const stats = userStats.get(socket.id);
                stats.reports++;
                stats.lastReportTime = Date.now();

                if (stats.reports >= MAX_REPORTS) {
                    rateLimits.set(socket.id, Date.now() + RATE_LIMIT_WINDOW);
                }

                io.to(reportedId).emit('reported');
                console.log(`User ${socket.id} reported ${reportedId}`);
            } else {
                socket.emit('error', { message: 'Report limit exceeded' });
            }
        } catch (error) {
            console.error('Error in report:', error);
            socket.emit('error', { message: 'Failed to process report' });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        try {
            const partnerId = activeConnections.get(socket.id);
            if (partnerId) {
                io.to(partnerId).emit('partner-left');
                activeConnections.delete(partnerId);
                activeConnections.delete(socket.id);
            }
            waitingUsers.delete(socket.id);
            userStats.delete(socket.id);
            rateLimits.delete(socket.id);
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });
});

// Matchmaking function
function matchUsers() {
    try {
        const users = Array.from(waitingUsers.entries());
        
        // Group users by mode
        const videoUsers = users.filter(([_, mode]) => mode === 'video');
        const voiceUsers = users.filter(([_, mode]) => mode === 'voice');
        const textUsers = users.filter(([_, mode]) => mode === 'text');

        // Match users of the same mode
        matchUserGroup(videoUsers);
        matchUserGroup(voiceUsers);
        matchUserGroup(textUsers);
    } catch (error) {
        console.error('Error in matchUsers:', error);
    }
}

function matchUserGroup(users) {
    try {
        while (users.length >= 2) {
            const [user1, user2] = users.splice(0, 2);
            const [id1, mode1] = user1;
            const [id2, mode2] = user2;

            waitingUsers.delete(id1);
            waitingUsers.delete(id2);

            activeConnections.set(id1, id2);
            activeConnections.set(id2, id1);

            io.to(id1).emit('matched', { partnerId: id2 });
            io.to(id2).emit('matched', { partnerId: id1 });
        }
    } catch (error) {
        console.error('Error in matchUserGroup:', error);
    }
}

// Rate limiting helper
function isRateLimited(userId) {
    try {
        const limitTime = rateLimits.get(userId);
        if (limitTime && Date.now() < limitTime) {
            return true;
        }
        if (limitTime && Date.now() >= limitTime) {
            rateLimits.delete(userId);
        }
        return false;
    } catch (error) {
        console.error('Error in isRateLimited:', error);
        return true; // Default to rate limiting on error
    }
}

// Report limiting helper
function canReport(userId) {
    try {
        const stats = userStats.get(userId);
        if (!stats) return false;
        
        if (stats.reports >= MAX_REPORTS) {
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error in canReport:', error);
        return false;
    }
}

// Message rate limiting helper
function canSendMessage(userId) {
    try {
        const stats = userStats.get(userId);
        if (!stats) return false;

        const now = Date.now();
        if (now - stats.lastMessageTime > 60000) {
            stats.messagesSent = 0;
            stats.lastMessageTime = now;
        }

        return stats.messagesSent < MAX_MESSAGES_PER_MINUTE;
    } catch (error) {
        console.error('Error in canSendMessage:', error);
        return false;
    }
}

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Export for testing
module.exports = {
    app,
    server,
    io,
    waitingUsers,
    activeConnections,
    userStats,
    rateLimits
};

// Start server if not being required as a module
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
} 