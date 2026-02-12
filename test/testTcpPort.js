const assert = require('node:assert');
const http = require('node:http');

const ping = require('../build/lib/ping');

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
        assert(!!result);
        assert(result.host === '192.168.1.1');
        assert(result.port === 80);
        done();
    });

    it('Test parseAddress with hostname and port', function (done) {
        const result = ping.parseAddress('google.com:443');
        assert(!!result);
        assert(result.host === 'google.com');
        assert(result.port === 443);
        done();
    });

    it('Test parseAddress without port', function (done) {
        const result = ping.parseAddress('192.168.1.1');
        assert(!!result);
        assert(result.host === '192.168.1.1');
        assert(result.port === null);
        done();
    });

    it('Test TCP port check - open port', function (done) {
        this.timeout(5000);
        ping.probe(`127.0.0.1:${serverPort}`, { log: () => {} }, (err, result) => {
            assert(!err);
            assert(result);
            assert(result.alive === true);
            assert(result.host === `127.0.0.1:${serverPort}`);
            assert(typeof result.ms === 'number');
            assert(result.ms >= 0);
            done();
        });
    });

    it('Test TCP port check - closed port', function (done) {
        this.timeout(5000);
        const closedPort = serverPort + 1000;
        ping.probe(`127.0.0.1:${closedPort}`, { log: () => {}, timeout: 1 }, (err, result) => {
            assert(!err);
            assert(!!result);
            assert(result.alive === false);
            assert(result.host === `127.0.0.1:${closedPort}`);
            assert(result.ms === null);
            done();
        });
    });

    it('Test regular ping still works', function (done) {
        this.timeout(5000);
        ping.probe('127.0.0.1', { log: () => {}, minReply: 1 }, (err, result) => {
            assert(!err);
            assert(!!result);
            assert(result.alive === true);
            assert(result.host === '127.0.0.1');
            done();
        });
    });
});
