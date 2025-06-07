const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('Client WebRTC', () => {
    let dom;
    let window;
    let document;

    before(() => {
        const html = fs.readFileSync(path.join(__dirname, '../client/index.html'), 'utf8');
        dom = new JSDOM(html, {
            runScripts: 'dangerously',
            resources: 'usable',
            url: 'http://localhost:3000'
        });
        window = dom.window;
        document = window.document;
    });

    it('should have required video elements', () => {
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
        expect(localVideo).to.exist;
        expect(remoteVideo).to.exist;
        expect(localVideo.tagName).to.equal('VIDEO');
        expect(remoteVideo.tagName).to.equal('VIDEO');
    });

    it('should have required buttons', () => {
        const startButton = document.getElementById('startButton');
        const nextButton = document.getElementById('nextButton');
        const reportButton = document.getElementById('reportButton');
        
        expect(startButton).to.exist;
        expect(nextButton).to.exist;
        expect(reportButton).to.exist;
        expect(startButton.disabled).to.be.false;
        expect(nextButton.disabled).to.be.true;
        expect(reportButton.disabled).to.be.true;
    });

    it('should have status message element', () => {
        const statusMessage = document.getElementById('statusMessage');
        expect(statusMessage).to.exist;
        expect(statusMessage.textContent).to.include('Click "Start Chat"');
    });
}); 