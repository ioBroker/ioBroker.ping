const assert = require('node:assert');
const cp = require('node:child_process');
const os = require('node:os');

const ping = require('../build/lib/ping');

/** What probe() passes without options in the configuration */
const DEFAULTS = { numeric: true, timeout: 2, minReply: 1, extra: [] };

describe('Which program pings and with which arguments', function () {
    function check(platform, host, expected) {
        assert.deepStrictEqual(
            ping.buildPingCommand(platform, host, DEFAULTS),
            expected,
            `buildPingCommand('${platform}', '${host}')`,
        );
    }

    it('linux: ping with -w for IPv4 and IPv6 - iputils and busybox take the family from the address', function () {
        check('linux', '192.168.1.1', {
            binary: 'ping',
            args: ['-n', '-w', '2', '-c', '1', '192.168.1.1'],
            killAfter: null,
        });
        check('linux', 'fd00::1', { binary: 'ping', args: ['-n', '-w', '2', '-c', '1', 'fd00::1'], killAfter: null });
        check('linux', 'fe80::1%eth0', {
            binary: 'ping',
            args: ['-n', '-w', '2', '-c', '1', 'fe80::1%eth0'],
            killAfter: null,
        });
    });

    it('win32: ping.exe with -n and -w in ms for IPv4 and IPv6', function () {
        check('win32', '192.168.1.1', {
            binary: 'ping.exe',
            args: ['-n', '1', '-w', '2000', '192.168.1.1'],
            killAfter: null,
        });
        check('win32', 'fd00::1', { binary: 'ping.exe', args: ['-n', '1', '-w', '2000', 'fd00::1'], killAfter: null });
    });

    for (const platform of ['darwin', 'freebsd']) {
        it(`${platform}: ping with -t for IPv4`, function () {
            check(platform, '192.168.1.1', {
                binary: 'ping',
                args: ['-n', '-t', '2', '-c', '1', '192.168.1.1'],
                killAfter: null,
            });
            check(platform, 'iob-server', {
                binary: 'ping',
                args: ['-n', '-t', '2', '-c', '1', 'iob-server'],
                killAfter: null,
            });
        });

        it(`${platform}: ping6 without -t, stopped after the timeout, for IPv6`, function () {
            check(platform, 'fd00::1', { binary: 'ping6', args: ['-n', '-c', '1', 'fd00::1'], killAfter: 2000 });
            check(platform, '::1', { binary: 'ping6', args: ['-n', '-c', '1', '::1'], killAfter: 2000 });
            check(platform, '::ffff:192.168.1.1', {
                binary: 'ping6',
                args: ['-n', '-c', '1', '::ffff:192.168.1.1'],
                killAfter: 2000,
            });
            check(platform, 'fe80::1%en0', {
                binary: 'ping6',
                args: ['-n', '-c', '1', 'fe80::1%en0'],
                killAfter: 2000,
            });
        });
    }

    it('passes the options through', function () {
        const options = { numeric: false, timeout: 5, minReply: 3, extra: ['-i', '0.5'] };
        assert.deepStrictEqual(ping.buildPingCommand('linux', 'fd00::1', options), {
            binary: 'ping',
            args: ['-w', '5', '-c', '3', '-i', '0.5', 'fd00::1'],
            killAfter: null,
        });
        assert.deepStrictEqual(ping.buildPingCommand('darwin', 'fd00::1', options), {
            binary: 'ping6',
            args: ['-c', '3', '-i', '0.5', 'fd00::1'],
            killAfter: 5000,
        });
        assert.deepStrictEqual(ping.buildPingCommand('win32', 'fd00::1', options), {
            binary: 'ping.exe',
            args: ['-n', '3', '-w', '5000', '-i', '0.5', 'fd00::1'],
            killAfter: null,
        });
    });

    it('does not support other platforms', function () {
        assert.strictEqual(ping.buildPingCommand('aix', '192.168.1.1', DEFAULTS), null);
        assert.strictEqual(ping.buildPingCommand('android', 'fd00::1', DEFAULTS), null);
    });
});

describe('The round trip in the output of a ping', function () {
    it('reads Linux (iputils) for IPv4 and IPv6', function () {
        assert.strictEqual(
            ping.parsePingTime(
                'PING 192.168.1.1 (192.168.1.1) 56(84) bytes of data.\n' +
                    '64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=0.402 ms\n\n' +
                    '--- 192.168.1.1 ping statistics ---\n' +
                    '1 packets transmitted, 1 received, 0% packet loss, time 0ms\n' +
                    'rtt min/avg/max/mdev = 0.402/0.402/0.402/0.000 ms\n',
            ),
            0.402,
        );
        assert.strictEqual(
            ping.parsePingTime('PING ::1(::1) 56 data bytes\n64 bytes from ::1: icmp_seq=1 ttl=64 time=0.045 ms\n'),
            0.045,
        );
    });

    it('reads ping and ping6 of macOS and FreeBSD - ping6 writes hlim instead of ttl', function () {
        assert.strictEqual(
            ping.parsePingTime(
                'PING 192.168.1.1 (192.168.1.1): 56 data bytes\n64 bytes from 192.168.1.1: icmp_seq=0 ttl=64 time=3.161 ms\n',
            ),
            3.161,
        );
        assert.strictEqual(
            ping.parsePingTime(
                'PING6(56=40+8+8 bytes) ::1 --> ::1\n16 bytes from ::1, icmp_seq=0 hlim=64 time=0.067 ms\n\n' +
                    '--- ::1 ping6 statistics ---\n1 packets transmitted, 1 packets received, 0.0% packet loss\n' +
                    'round-trip min/avg/max/std-dev = 0.067/0.067/0.067/0.000 ms\n',
            ),
            0.067,
        );
    });

    it('reads Windows for IPv4, in several languages', function () {
        assert.strictEqual(ping.parsePingTime('Reply from 192.168.1.1: bytes=32 time=12ms TTL=64\r\n'), 12);
        assert.strictEqual(ping.parsePingTime('Antwort von 127.0.0.1: Bytes=32 Zeit<1ms TTL=128\r\n'), 1);
    });

    it('reads Windows for IPv6, which writes no TTL', function () {
        const german =
            '\r\nPing wird ausgeführt für ::1 mit 32 Bytes Daten:\r\nAntwort von ::1: Zeit<1ms \r\n\r\n' +
            'Ping-Statistik für ::1:\r\n    Pakete: Gesendet = 1, Empfangen = 1, Verloren = 0\r\n    (0% Verlust),\r\n' +
            'Ca. Zeitangaben in Millisek.:\r\n    Minimum = 0ms, Maximum = 0ms, Mittelwert = 0ms\r\n';
        assert.strictEqual(ping.parsePingTime(german), 1);
        assert.strictEqual(ping.parsePingTime('Reply from fd00::1: time=12ms\r\n'), 12);
        assert.strictEqual(ping.parsePingTime('Réponse de fd00::1 : temps=3 ms\r\n'), 3);
        assert.strictEqual(ping.parsePingTime('Ответ от fd00::1: время=7мс\r\n'), 7);
        assert.strictEqual(ping.parsePingTime('::1 からの応答: 時間 <1ms\r\n'), 1);
    });

    it('finds no time without a reply', function () {
        // Windows: no answer, or a router that says the host is unreachable (ping.exe ends with 0 then)
        assert.strictEqual(
            ping.parsePingTime(
                'Pinging fd00::1234 with 32 bytes of data:\r\nRequest timed out.\r\n\r\n' +
                    'Ping statistics for fd00::1234:\r\n    Packets: Sent = 1, Received = 0, Lost = 1 (100% loss),\r\n',
            ),
            null,
        );
        assert.strictEqual(
            ping.parsePingTime(
                'Pinging 192.168.1.20 with 32 bytes of data:\r\n' +
                    'Reply from 192.168.1.10: Destination host unreachable.\r\n\r\n' +
                    'Ping statistics for 192.168.1.20:\r\n    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),\r\n',
            ),
            null,
        );
        assert.strictEqual(
            ping.parsePingTime(
                'Ping wird ausgeführt für fd00::1234 mit 32 Bytes Daten:\r\nZeitüberschreitung der Anforderung.\r\n\r\n' +
                    'Ping-Statistik für fd00::1234:\r\n    Pakete: Gesendet = 1, Empfangen = 0, Verloren = 1\r\n    (100% Verlust),\r\n',
            ),
            null,
        );
        // Linux, macOS
        assert.strictEqual(
            ping.parsePingTime(
                'PING fd00::1234(fd00::1234) 56 data bytes\n\n--- fd00::1234 ping statistics ---\n' +
                    '1 packets transmitted, 0 received, 100% packet loss, time 0ms\n',
            ),
            null,
        );
        assert.strictEqual(ping.parsePingTime(''), null);
    });
});

describe('ping6 of macOS and FreeBSD', function () {
    // probe() as on macOS: os.platform() says "darwin" while the module is loaded, and spawn() starts a node
    // process instead of ping6 that behaves like it
    const modulePath = require.resolve('../build/lib/ping');
    let darwinPing;
    let spawned;
    const realSpawn = cp.spawn;

    function fakePing6(script) {
        cp.spawn = (binary, args) => {
            spawned.push({ binary, args });
            return realSpawn(process.execPath, ['-e', script]);
        };
    }

    before(function () {
        const cached = require.cache[modulePath];
        const realPlatform = os.platform;
        delete require.cache[modulePath];
        os.platform = () => 'darwin';
        try {
            darwinPing = require(modulePath);
        } finally {
            os.platform = realPlatform;
            require.cache[modulePath] = cached;
        }
    });

    beforeEach(function () {
        spawned = [];
    });

    afterEach(function () {
        cp.spawn = realSpawn;
    });

    it('is stopped after the timeout when the device does not answer', function (done) {
        this.timeout(5000);
        // ping6 waits 10 s for a device that does not answer
        fakePing6('setTimeout(() => {}, 10000)');
        const started = Date.now();
        darwinPing.probe('[fd00::1234]', { log: () => {}, timeout: 1 }, (err, result) => {
            try {
                const elapsed = Date.now() - started;
                assert.ok(!err, `Unexpected error: ${err}`);
                assert.strictEqual(spawned.length, 1);
                assert.match(spawned[0].binary, /ping6$/);
                assert.deepStrictEqual(spawned[0].args, ['-n', '-c', '1', 'fd00::1234']);
                assert.strictEqual(result.alive, false);
                assert.strictEqual(result.ms, null);
                assert.strictEqual(result.host, '[fd00::1234]');
                assert.ok(elapsed >= 900 && elapsed < 4000, `stopped after ${elapsed} ms instead of about 1000 ms`);
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    it('reports an answer with its time', function (done) {
        this.timeout(5000);
        fakePing6(
            "console.log('PING6(56=40+8+8 bytes) ::1 --> ::1'); console.log('16 bytes from ::1, icmp_seq=0 hlim=64 time=0.067 ms'); process.exit(0)",
        );
        darwinPing.probe('::1', { log: () => {} }, (err, result) => {
            try {
                assert.ok(!err, `Unexpected error: ${err}`);
                assert.match(spawned[0].binary, /ping6$/);
                assert.strictEqual(result.alive, true);
                assert.strictEqual(result.ms, 0.067);
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    it('pings IPv4 with ping and -t', function (done) {
        this.timeout(5000);
        fakePing6('process.exit(2)');
        darwinPing.probe('192.168.1.1', { log: () => {} }, (err, result) => {
            try {
                assert.ok(!err, `Unexpected error: ${err}`);
                assert.match(spawned[0].binary, /(^|\/)ping$/);
                assert.deepStrictEqual(spawned[0].args, ['-n', '-t', '2', '-c', '1', '192.168.1.1']);
                assert.strictEqual(result.alive, false);
                done();
            } catch (e) {
                done(e);
            }
        });
    });
});
