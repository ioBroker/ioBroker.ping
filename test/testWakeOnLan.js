const assert = require('node:assert');
const dgram = require('node:dgram');

const { default: wakeOnLan, isMACValid } = require('../build/lib/wakeOnLan');

/** The magic packet for 01:23:45:67:89:AB: 6 x 0xFF and 16 x the MAC */
const expected = Buffer.concat([
    Buffer.alloc(6, 0xff),
    ...Array.from({ length: 16 }, () => Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab])),
]);

describe('Test Wake-on-LAN', function () {
    let server;
    let serverPort;
    let packets = [];

    before('Start UDP listener', function (done) {
        server = dgram.createSocket('udp4');
        server.on('message', msg => packets.push(msg));
        server.bind(0, '127.0.0.1', () => {
            serverPort = server.address().port;
            done();
        });
    });

    after('Stop UDP listener', function (done) {
        server ? server.close(() => done()) : done();
    });

    for (const mac of [
        '01:23:45:67:89:AB',
        '01:23:45:67:89:ab',
        '01-23-45-67-89-AB',
        '01-23-45-67-89-ab',
        '01.23.45.67.89.AB',
        '0123456789aB',
        '0123.4567.89ab',
    ]) {
        it(`Sends the magic packet for ${mac}`, async function () {
            assert.ok(isMACValid(mac), mac);
            packets = [];
            const log = console.log;
            console.log = () => {};
            try {
                wakeOnLan(mac, { port: serverPort, ip: '127.0.0.1' });
                // the datagram is delivered asynchronously
                await new Promise(resolve => setTimeout(resolve, 200));
            } finally {
                console.log = log;
            }
            assert.strictEqual(packets.length, 1);
            assert.deepStrictEqual(packets[0], expected);
        });
    }

    it('Rejects invalid MAC addresses without throwing', function () {
        for (const mac of [
            '',
            '01:23:45:67:89',
            '01:23:45:67:89:AB:CD',
            '01:23-45:67:89:AB',
            '01:23:45:6789AB',
            '0123:4567:89AB',
            '01 23 45 67 89 AB',
            '01*23*45*67*89*AB',
            '01(23(45(67(89(AB',
            '01:23:45:67:89:AG',
            ' 01:23:45:67:89:AB',
            '0123456789ABC',
            undefined,
            null,
            123456789012,
            {},
        ]) {
            assert.strictEqual(isMACValid(mac), false, String(mac));
        }
    });
});
