const { expect } = require('chai');
const io = require('socket.io-client');
const http = require('http');
const { Server } = require('socket.io');
const { app, server, io: serverIo } = require('../server/index');

describe('Chat Server', () => {
    let clientSocket;
    let clientSocket2;
    const PORT = 3001; // Use a different port for testing

    before((done) => {
        server.listen(PORT, () => {
            done();
        });
    });

    after((done) => {
        server.close(() => {
            done();
        });
    });

    beforeEach((done) => {
        clientSocket = io(`http://localhost:${PORT}`);
        clientSocket2 = io(`http://localhost:${PORT}`);
        clientSocket.on('connect', done);
    });

    afterEach(() => {
        clientSocket.close();
        clientSocket2.close();
    });

    it('should connect to the server', (done) => {
        expect(clientSocket.connected).to.be.true;
        done();
    });

    it('should match two users when they join', (done) => {
        let matched = false;
        
        clientSocket.on('matched', (data) => {
            expect(data).to.have.property('partnerId');
            matched = true;
        });

        clientSocket2.on('matched', (data) => {
            expect(data).to.have.property('partnerId');
            expect(matched).to.be.true;
            done();
        });

        clientSocket.emit('join');
        clientSocket2.emit('join');
    });

    it('should handle next button correctly', (done) => {
        let partnerLeft = false;

        clientSocket.on('matched', () => {
            clientSocket2.emit('next');
        });

        clientSocket.on('partner-left', () => {
            partnerLeft = true;
        });

        clientSocket2.on('matched', () => {
            setTimeout(() => {
                expect(partnerLeft).to.be.true;
                done();
            }, 100);
        });

        clientSocket.emit('join');
        clientSocket2.emit('join');
    });
}); 