const assert = require('node:assert');
const dgram = require('node:dgram');

const ping = require('../build/lib/ping');
const { sendUdpBurst, UDP_WAKE_COUNT, UDP_WAKE_SETTLE } = require('../build/lib/udpWake');

describe('Test UDP wake of sleeping devices', function () {
    let server;
    let serverPort;
    let received = 0;

    before('Start UDP listener', function (done) {
        server = dgram.createSocket('udp4');
        server.on('message', () => received++);
        server.bind(0, '127.0.0.1', () => {
            serverPort = server.address().port;
            done();
        });
    });

    after('Stop UDP listener', function (done) {
        server ? server.close(() => done()) : done();
    });

    it('Burst sends all packets', async function () {
        received = 0;
        await sendUdpBurst('127.0.0.1', { port: serverPort });
        // the datagrams are delivered asynchronously
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(received, UDP_WAKE_COUNT);
    });

    it('Burst to an unresolvable host rejects instead of throwing', async function () {
        await assert.rejects(sendUdpBurst('host.invalid', { port: serverPort, count: 1 }));
    });

    it('Probe with wake pings after the settle time', function (done) {
        this.timeout(10000);
        const start = Date.now();
        ping.probe('127.0.0.1', { udpWake: true, log: () => {} }, (err, result) => {
            assert.ifError(err);
            assert.ok(result.alive, '127.0.0.1 should be alive');
            assert.ok(Date.now() - start >= UDP_WAKE_SETTLE, 'ping must wait for the device to wake up');
            done();
        });
    });
});
