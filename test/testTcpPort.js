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
        assert(!!result, 'Result should not be falsy');
        assert(result.host === '192.168.1.1', 'Host should match 192.168.1.1');
        assert(result.port === 80, 'Port should be 80');
        done();
    });

    it('Test parseAddress with hostname and port', function (done) {
        const result = ping.parseAddress('google.com:443');
        assert(!!result, 'Result should not be falsy');
        assert(result.host === 'google.com', 'Host should match google.com');
        assert(result.port === 443, 'Port should be 443');
        done();
    });

    it('Test parseAddress without port', function (done) {
        const result = ping.parseAddress('192.168.1.1');
        assert(!!result, 'Result should not be falsy');
        assert(result.host === '192.168.1.1', 'Host should match 192.168.1.1');
        assert(result.port === null, 'Port should be null');
        done();
    });

    it('Test TCP port check - open port', function (done) {
        this.timeout(5000);
        ping.probe(`127.0.0.1:${serverPort}`, { log: () => {} }, (err, result) => {
            assert(!err, 'Error should be falsy');
            assert(result, 'Result should be defined');
            assert(result.alive === true, 'Device should be alive');
            assert(result.host === `127.0.0.1:${serverPort}`, 'Host should match 127.0.0.1 with port');
            assert(typeof result.ms === 'number', 'Time should be a number');
            assert(result.ms >= 0, 'Time should be positive');
            done();
        });
    });

    it('Test TCP port check - closed port', function (done) {
        this.timeout(5000);
        const closedPort = serverPort + 1000;
        ping.probe(`127.0.0.1:${closedPort}`, { log: () => {}, timeout: 1 }, (err, result) => {
            assert(!err, 'Error should be falsy');
            assert(!!result, 'Result should be defined');
            assert(result.alive === false, 'Device should not be alive');
            assert(result.host === `127.0.0.1:${closedPort}`, 'Host should match 127.0.0.1 with correct closed port');
            assert(result.ms === null, 'Time should be null for closed port');
            done();
        });
    });

    it('Test regular ping still works', function (done) {
        this.timeout(5000);
        ping.probe('127.0.0.1', { log: () => {}, minReply: 1 }, (err, result) => {
            assert(!err, 'Error should be falsy');
            assert(!!result, 'Result should be defined');
            assert(result.alive === true, 'Device should be alive on regular ping');
            assert(result.host === '127.0.0.1', 'Host should match 127.0.0.1');
            done();
        });
    });
});
