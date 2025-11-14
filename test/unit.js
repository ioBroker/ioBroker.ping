const expect = require('chai').expect;
const ping = require('../lib/ping');
const http = require('node:http');

describe('Test TCP Port Monitoring', function () {
    let server;
    let serverPort;

    before('Start test HTTP server', function (done) {
        server = http.createServer((req, res) => {
            res.writeHead(200);
            res.end('OK');
        });

        server.listen(0, '127.0.0.1', () => {
            serverPort = server.address().port;
            console.log(`Test server started on port ${serverPort}`);
            done();
        });
    });

    after('Stop test HTTP server', function (done) {
        if (server) {
            server.close(() => {
                console.log('Test server stopped');
                done();
            });
        } else {
            done();
        }
    });

    it('Test parseAddress with port', function (done) {
        const result = ping.parseAddress('192.168.1.1:80');
        expect(result).to.be.ok;
        expect(result.host).to.equal('192.168.1.1');
        expect(result.port).to.equal(80);
        done();
    });

    it('Test parseAddress with hostname and port', function (done) {
        const result = ping.parseAddress('google.com:443');
        expect(result).to.be.ok;
        expect(result.host).to.equal('google.com');
        expect(result.port).to.equal(443);
        done();
    });

    it('Test parseAddress without port', function (done) {
        const result = ping.parseAddress('192.168.1.1');
        expect(result).to.be.ok;
        expect(result.host).to.equal('192.168.1.1');
        expect(result.port).to.equal(null);
        done();
    });

    it('Test TCP port check - open port', function (done) {
        this.timeout(5000);
        ping.probe(`127.0.0.1:${serverPort}`, { log: () => {} }, (err, result) => {
            expect(err).to.be.not.ok;
            expect(result).to.be.ok;
            expect(result.alive).to.be.true;
            expect(result.host).to.equal(`127.0.0.1:${serverPort}`);
            expect(result.ms).to.be.a('number');
            expect(result.ms).to.be.at.least(0);
            done();
        });
    });

    it('Test TCP port check - closed port', function (done) {
        this.timeout(5000);
        const closedPort = serverPort + 1000;
        ping.probe(`127.0.0.1:${closedPort}`, { log: () => {}, timeout: 1 }, (err, result) => {
            expect(err).to.be.not.ok;
            expect(result).to.be.ok;
            expect(result.alive).to.be.false;
            expect(result.host).to.equal(`127.0.0.1:${closedPort}`);
            expect(result.ms).to.equal(null);
            done();
        });
    });

    it('Test regular ping still works', function (done) {
        this.timeout(5000);
        ping.probe('127.0.0.1', { log: () => {}, minReply: 1 }, (err, result) => {
            expect(err).to.be.not.ok;
            expect(result).to.be.ok;
            expect(result.alive).to.be.true;
            expect(result.host).to.equal('127.0.0.1');
            done();
        });
    });
});
