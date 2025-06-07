# Chatroulette Clone

A real-time video chat application that randomly pairs users for video conversations. Built with WebRTC, Socket.IO, and Node.js.

## Features

- Random 1-on-1 video chat
- "Next" button to skip to a new person
- Anonymous usage (no login required)
- Report system for moderation
- Responsive design for mobile and desktop

## Prerequisites

- Node.js (v14 or higher)
- Modern web browser with WebRTC support
- Webcam and microphone

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd chatroulette-clone
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Development

To run the server in development mode with auto-reload:
```bash
npm run dev
```

## Security Considerations

- The application uses a basic STUN server for NAT traversal
- For production, consider adding:
  - TURN server support
  - HTTPS
  - Rate limiting
  - IP-based blocking
  - Content moderation

## Browser Support

The application works best in modern browsers that support WebRTC:
- Chrome (recommended)
- Firefox
- Safari
- Edge

## License

MIT 