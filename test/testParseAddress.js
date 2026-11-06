const assert = require('node:assert');
const net = require('node:net');

const ping = require('../build/lib/ping');

describe('Which address gets a TCP check and which one a ping', function () {
    function check(addr, host, port) {
        assert.deepStrictEqual(ping.parseAddress(addr), { host, port }, `parseAddress('${addr}')`);
    }

    it('pings an IPv4 address', function () {
        check('192.168.1.1', '192.168.1.1', null);
    });

    it('checks the port of an IPv4 address', function () {
        check('192.168.1.1:80', '192.168.1.1', 80);
    });

    it('pings a host name', function () {
        check('google.com', 'google.com', null);
        check('iob-server', 'iob-server', null);
    });

    it('checks the port of a host name', function () {
        check('google.com:443', 'google.com', 443);
        check('iob-server:8081', 'iob-server', 8081);
    });

    it('pings an IPv6 address without brackets, even if it ends in digits', function () {
        check('fd00::1', 'fd00::1', null);
        check('2001:db8::42', '2001:db8::42', null);
        check('::1', '::1', null);
        check('fe80::1', 'fe80::1', null);
        check('2001:db8:0:0:0:0:0:1', '2001:db8:0:0:0:0:0:1', null);
        check('fd00::abcd', 'fd00::abcd', null);
        // IPv4-mapped
        check('::ffff:192.168.1.1', '::ffff:192.168.1.1', null);
        // with a zone id
        check('fe80::1%eth0', 'fe80::1%eth0', null);
        check('fe80::1%12', 'fe80::1%12', null);
    });

    it('checks the port of an IPv6 address in brackets', function () {
        check('[fd00::1]:80', 'fd00::1', 80);
        check('[2001:db8::42]:443', '2001:db8::42', 443);
        check('[::1]:8081', '::1', 8081);
        check('[::ffff:192.168.1.1]:80', '::ffff:192.168.1.1', 80);
        check('[fe80::1%eth0]:22', 'fe80::1%eth0', 22);
    });

    it('reports a TCP check of an IPv6 address in brackets', function (done) {
        this.timeout(5000);
        const server = net.createServer(socket => socket.destroy());
        server.once('error', () => {
            // no IPv6 on this machine (e.g. a container without it)
            this.skip();
        });
        server.listen(0, '::1', () => {
            const port = server.address().port;
            ping.probe(`[::1]:${port}`, { log: () => {} }, (err, result) => {
                server.close();
                try {
                    assert.ok(!err, `Unexpected error: ${err}`);
                    assert.strictEqual(result.alive, true);
                    assert.strictEqual(result.host, `[::1]:${port}`);
                    assert.strictEqual(typeof result.ms, 'number');
                    done();
                } catch (e) {
                    done(e);
                }
            });
        });
    });
});
