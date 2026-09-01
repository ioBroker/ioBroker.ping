const assert = require('node:assert');
const net = require('node:net');

const ping = require('../build/lib/ping');
const fallback = require('../build/lib/pingFallback');

describe('Ping without the permission to send ICMP', function () {
    it('recognizes what an unprivileged container answers', function () {
        // iputils, the usual case in an LXC container
        assert.strictEqual(fallback.isPermissionError('ping: socket: Operation not permitted'), true);
        // older iputils
        assert.strictEqual(fallback.isPermissionError('ping: icmp open socket: Operation not permitted'), true);
        // busybox, e.g. an alpine container
        assert.strictEqual(fallback.isPermissionError('ping: permission denied (are you root?)'), true);
        // a local firewall dropping our echo request - ICMP is unusable here as well
        assert.strictEqual(fallback.isPermissionError('ping: sendmsg: Operation not permitted'), true);
    });

    it('does not confuse an offline device with a missing permission', function () {
        assert.strictEqual(fallback.isPermissionError(''), false);
        assert.strictEqual(fallback.isPermissionError(undefined), false);
        assert.strictEqual(
            fallback.isPermissionError('From 192.168.1.1 icmp_seq=1 Destination Host Unreachable'),
            false,
        );
        assert.strictEqual(fallback.isPermissionError('ping: unknown host'), false);
    });

    it('reports a reachable host without a permission problem', function (done) {
        ping.probe('127.0.0.1', { log: () => {} }, (err, result) => {
            assert.ok(!err, `Unexpected error: ${err}`);
            assert.strictEqual(result.denied, false);
            done();
        });
    });
});

describe('What a refused connection says', function () {
    it('counts an answer as proof that somebody is there', function () {
        // both come from the host itself, so it exists
        assert.strictEqual(fallback.classifyConnectError('ECONNREFUSED'), 'alive');
        assert.strictEqual(fallback.classifyConnectError('ECONNRESET'), 'alive');
    });

    it('keeps silence as silence', function () {
        ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EACCES', undefined].forEach(code =>
            assert.strictEqual(fallback.classifyConnectError(code), 'unknown', String(code)),
        );
    });
});

describe('The port list of the TCP fallback', function () {
    it('reads what the settings carry', function () {
        assert.deepStrictEqual(fallback.parsePorts('80,443, 8080'), [80, 443, 8080]);
        assert.deepStrictEqual(fallback.parsePorts('80;443 22'), [80, 443, 22]);
        assert.deepStrictEqual(fallback.parsePorts([80, 443]), [80, 443]);
    });

    it('drops what is not a port and keeps every port once', function () {
        assert.deepStrictEqual(fallback.parsePorts('80,80,0,65536,-1,http'), [80]);
    });

    it('falls back to the defaults when nothing usable is configured', function () {
        assert.deepStrictEqual(fallback.parsePorts(''), fallback.DEFAULT_TCP_PORTS);
        assert.deepStrictEqual(fallback.parsePorts(undefined), fallback.DEFAULT_TCP_PORTS);
        assert.deepStrictEqual(fallback.parsePorts('nothing here'), fallback.DEFAULT_TCP_PORTS);
    });

    it('hands out a copy, so that a caller cannot edit the defaults', function () {
        const ports = fallback.parsePorts('');
        ports.push(1);
        assert.ok(!fallback.DEFAULT_TCP_PORTS.includes(1));
    });
});

describe('The hint in the log', function () {
    it('names the setting of this adapter and both manual repairs', function () {
        const lines = fallback.deniedHint('ping: socket: Operation not permitted', [80, 443]).join('\n');
        assert.ok(lines.includes('ping: socket: Operation not permitted'), lines);
        assert.ok(lines.includes('setcap'), lines);
        assert.ok(lines.includes('ping_group_range'), lines);
        assert.ok(lines.includes('80, 443'), lines);
    });

    it('points at the fallback setting while it is switched off', function () {
        const lines = fallback.deniedHint('ping: socket: Operation not permitted').join('\n');
        assert.ok(lines.includes('Check over TCP'), lines);
    });

    it('copes with a ping that said nothing at all', function () {
        assert.strictEqual(fallback.deniedHint(undefined, [80]).length, 3);
    });
});

describe('The TCP fallback probe', function () {
    let server;
    let port;

    before(function (done) {
        server = net.createServer(socket => socket.end());
        server.listen(0, '127.0.0.1', () => {
            port = server.address().port;
            done();
        });
    });

    after(function (done) {
        server.close(done);
    });

    it('finds a device by an open port', function (done) {
        fallback.probeTcp('127.0.0.1', [port], 2000, result => {
            assert.strictEqual(result.alive, true);
            assert.strictEqual(result.port, port);
            assert.ok(result.ms !== null, 'a round trip is measured');
            done();
        });
    });

    it('finds a device that only refuses the connection', function (done) {
        // nobody listens there, so the loopback answers with a reset
        fallback.probeTcp('127.0.0.1', [1], 2000, result => {
            assert.strictEqual(result.alive, true);
            done();
        });
    });

    it('answers once, not once per port', function (done) {
        let calls = 0;
        fallback.probeTcp('127.0.0.1', [port, port, 1], 2000, () => calls++);
        setTimeout(() => {
            assert.strictEqual(calls, 1);
            done();
        }, 500);
    });

    it('gives up on an address nobody answers for', function (done) {
        this.timeout(5000);
        // TEST-NET-1 (RFC 5737) is not routed anywhere
        fallback.probeTcp('192.0.2.1', [80], 300, result => {
            assert.strictEqual(result.alive, false);
            assert.strictEqual(result.ms, null);
            done();
        });
    });

    it('says "nobody" when there is no port to try', function (done) {
        fallback.probeTcp('127.0.0.1', [], 2000, result => {
            assert.strictEqual(result.alive, false);
            done();
        });
    });
});
