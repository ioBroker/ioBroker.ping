"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAddress = parseAddress;
exports.buildPingCommand = buildPingCommand;
exports.parsePingTime = parsePingTime;
exports.probe = probe;
const node_child_process_1 = __importDefault(require("node:child_process"));
const node_net_1 = __importDefault(require("node:net"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = require("node:os");
const pingFallback_1 = require("./pingFallback");
const udpWake_1 = require("./udpWake");
const p = (0, node_os_1.platform)().toLowerCase();
/**
 * A ping binary of this host: `ping`, or `ping6` for IPv6 on macOS and FreeBSD.
 *
 * Not every system keeps it in `/bin`: macOS and FreeBSD have `/sbin/ping` and `/sbin/ping6`, and a container
 * built without the usr-merge may only carry `/usr/bin/ping`. The bare name as the last resort lets PATH decide
 * instead of failing with ENOENT.
 */
function findPingBinary(name) {
    for (const dir of ['/bin', '/usr/bin', '/sbin', '/usr/sbin']) {
        const candidate = `${dir}/${name}`;
        if (node_fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return name;
}
/** The ports a TCP check can connect to */
const MIN_PORT = 1;
const MAX_PORT = 65535;
/** The host and the port of a TCP check - or why the port is not one */
function withPort(addr, host, digits) {
    const port = parseInt(digits, 10);
    if (port < MIN_PORT || port > MAX_PORT) {
        return {
            host,
            port,
            error: `Invalid TCP port ${digits} in "${addr}": a port has to be between ${MIN_PORT} and ${MAX_PORT}`,
        };
    }
    return { host, port };
}
/**
 * Split a configured address into the host and the port of a TCP check.
 *
 * - `192.168.1.1:80`, `google.com:443` - TCP check: a host name or an IPv4 address, one colon, the port
 * - `[fd00::1]:80` - TCP check of an IPv6 address, which has to be written in brackets
 * - `[fd00::1]` - brackets without a port: ping of the address without the brackets
 * - anything else is pinged, among others every IPv6 address without brackets: `fd00::1`, `::1`,
 *   `::ffff:192.168.1.1`, `fe80::1%eth0`. Its last group is not a port - `fd00::1` is not `fd00:` with port 1.
 * - a port outside 1-65535 (`host:0`, `[fd00::1]:99999`) is no TCP check and no ping: `error` says why
 *
 * The state IDs of a device do not depend on this - the adapter builds them from the address as configured.
 */
function parseAddress(addr) {
    const bracketed = addr.match(/^\[([^\]]+)\]:(\d+)$/);
    if (bracketed) {
        return withPort(addr, bracketed[1], bracketed[2]);
    }
    const bracketsOnly = addr.match(/^\[([^\]]+)\]$/);
    if (bracketsOnly) {
        return { host: bracketsOnly[1], port: null };
    }
    // more than one colon is an IPv6 address
    const match = addr.match(/^([^:]+):(\d+)$/);
    if (match) {
        return withPort(addr, match[1], match[2]);
    }
    return { host: addr, port: null };
}
/** `host:port` as the user writes it, so an IPv6 host gets its brackets back */
function formatAddress(host, port) {
    return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}
function probeTcpPort(host, port, config, callback) {
    const log = config.log || console.log;
    const timeout = (config.timeout || 2) * 1000;
    const startTime = Date.now();
    const address = formatAddress(host, port);
    log(`Checking TCP port ${address}`);
    const socket = new node_net_1.default.Socket();
    let timeoutHandle = null;
    let callbackCalled = false;
    const cleanup = () => {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }
        socket.destroy();
    };
    const returnResult = (alive, ms, error) => {
        if (!callbackCalled) {
            callbackCalled = true;
            cleanup();
            const result = { host: address, alive, ms };
            if (error) {
                result.error = error;
            }
            callback?.(null, result);
        }
    };
    timeoutHandle = setTimeout(() => {
        returnResult(false, null);
    }, timeout);
    socket.on('connect', () => {
        const ms = Date.now() - startTime;
        returnResult(true, ms);
    });
    socket.on('error', (err) => {
        log(`TCP port check error: ${err.message}`);
        returnResult(false, null);
    });
    try {
        socket.connect(port, host);
    }
    catch (err) {
        // connect() throws some errors at once instead of emitting them (ERR_SOCKET_BAD_PORT, invalid arguments).
        // That must not escape probe(): it is the result of this address, reported like every other one later.
        const message = err instanceof Error ? err.message : String(err);
        log(`TCP port check error: ${message}`);
        setImmediate(() => returnResult(false, null, message));
    }
}
function wakeWithUdpBurst(host, log, callback) {
    log(`UDP wake: burst to ${host}`);
    const pingLater = () => {
        setTimeout(callback, udpWake_1.UDP_WAKE_SETTLE);
    };
    (0, udpWake_1.sendUdpBurst)(host).then(pingLater, (e) => {
        log(`UDP wake error (pinging anyway): ${e.message}`);
        pingLater();
    });
}
/**
 * Which program pings `host` on `platform` (`os.platform()`), with which arguments.
 *
 * - linux (also sunos, unix): `ping -n -w <timeout> -c <count> <host>`. The same for IPv6 without `-6`: the ping of
 *   iputils since s20161105 and of busybox take the family from the address, and every Linux that runs Node.js 22
 *   (glibc 2.28: Debian 10, Ubuntu 20.04, RHEL 8 and newer) has such a ping. `-6` would only matter for a host name.
 * - win32: `ping.exe -n <count> -w <timeout in ms> <host>` - ping.exe takes the family from the address, too.
 * - darwin, freebsd, IPv4: `ping -n -t <timeout> -c <count> <host>`
 * - darwin, freebsd, IPv6: `ping6 -n -c <count> <host>`, stopped after the timeout with {@link PingCommand.killAfter},
 *   as ping6 has no option for it. FreeBSD 13+ has `ping6` as a link to `ping -6`, which needs nothing else.
 *
 * `host` is the address to ping as {@link parseAddress} returns it - an IPv6 address without brackets. Returns
 * `null` for a platform that is not supported. Pure: it starts nothing and looks at no file.
 */
function buildPingCommand(platform, host, options) {
    const extra = options.extra || [];
    if (['linux', 'sunos', 'unix'].includes(platform)) {
        const args = [];
        if (options.numeric !== false) {
            args.push('-n');
        }
        if (options.timeout !== false) {
            args.push('-w', String(options.timeout));
        }
        if (options.minReply !== false) {
            args.push('-c', String(options.minReply));
        }
        return { binary: 'ping', args: [...args, ...extra, host], killAfter: null };
    }
    if (platform.startsWith('win')) {
        const args = [];
        if (options.minReply !== false) {
            args.push('-n', String(options.minReply));
        }
        if (options.timeout !== false) {
            args.push('-w', String(options.timeout * 1000));
        }
        return { binary: 'ping.exe', args: [...args, ...extra, host], killAfter: null };
    }
    if (platform === 'darwin' || platform === 'freebsd') {
        const ipv6 = node_net_1.default.isIPv6(host);
        const args = [];
        if (options.numeric !== false) {
            args.push('-n');
        }
        // `-t` of ping6 is a node information query, not the timeout
        if (options.timeout !== false && !ipv6) {
            args.push('-t', String(options.timeout));
        }
        if (options.minReply !== false) {
            args.push('-c', String(options.minReply));
        }
        return {
            binary: ipv6 ? 'ping6' : 'ping',
            args: [...args, ...extra, host],
            killAfter: ipv6 && options.timeout !== false ? options.timeout * 1000 : null,
        };
    }
    return null;
}
/**
 * A reply with its round trip, by Linux, macOS and FreeBSD (`ttl=64 time=0.045 ms`, the ping6 of macOS and FreeBSD
 * writes the hop limit instead: `hlim=64 time=0.045 ms`) and by Windows for IPv4
 * (`Reply from 192.168.1.1: bytes=32 time<1ms TTL=64`, in the language of the system).
 */
const REPLY_TIME = /=.*[<|=]([0-9]*).*TTL|(?:ttl|hlim)..*=([0-9.]*)/;
/**
 * A reply of Windows for IPv6, which has no TTL: the time is the last field after the colon -
 * `Reply from ::1: time<1ms`, `Antwort von fd00::1: Zeit=12ms`, `Réponse de ::1 : temps<1ms`, `時間 <1ms`.
 * Neither the statistics (`Sent = 1, Received = 0, ...`, `Minimum = 0ms, ...`) nor
 * "Destination host unreachable" match.
 */
const REPLY_TIME_WINDOWS_IPV6 = /:\s*\S+\s?[<=]\s?([0-9]+)\s*[^\s\d]+\s*$/;
/**
 * The round trip in ms of the first reply in the output of a ping, `null` if there is none. On Windows this is the
 * only proof of an answer: ping.exe also ends with 0 when a router reports "Destination host unreachable".
 */
function parsePingTime(output) {
    const lines = output.split('\n');
    for (const regex of [REPLY_TIME, REPLY_TIME_WINDOWS_IPV6]) {
        for (const line of lines) {
            const m = regex.exec(line);
            if (m) {
                return parseFloat(m[1] || m[2]);
            }
        }
    }
    return null;
}
function probe(addr, config, callback) {
    config ||= {};
    const log = config.log || console.log;
    // Check if the address contains a port
    const parsed = parseAddress(addr);
    if (parsed.error) {
        // A mistake in the configuration, not a device that does not answer: nothing can be checked.
        // Reported later like every other result, so that a caller can rely on an asynchronous callback.
        const error = parsed.error;
        log(error);
        setImmediate(() => callback?.(null, { host: addr, alive: false, ms: null, error }));
        return;
    }
    if (parsed.port !== null) {
        // Use TCP port check
        return probeTcpPort(parsed.host, parsed.port, config, callback);
    }
    // `[fd00::1]` is pinged as `fd00::1` - the result keeps the address as configured
    const host = parsed.host;
    if (config.udpWake) {
        wakeWithUdpBurst(host, log, () => probe(addr, { ...config, udpWake: false }, callback));
        return;
    }
    let ls = null;
    let outString = '';
    let errString = '';
    const command = buildPingCommand(p, host, {
        numeric: config.numeric === undefined ? true : config.numeric,
        timeout: parseInt(String(config.timeout === undefined ? 2 : config.timeout), 10),
        minReply: parseInt(String(config.minReply === undefined ? 1 : config.minReply), 10),
        extra: config.extra || [],
    });
    if (!command) {
        callback?.(`Your platform "${p}" is not supported`);
        return;
    }
    try {
        if (command.binary === 'ping.exe') {
            const allArgs = [
                '/s', // leave quotes as they are
                '/c', // run and exit
                // !!! the order of c and s is important - c must come last!!!
                '"', // enforce starting quote
                `${process.env.SystemRoot}\\system32\\ping.exe`, // command itself. Notice that you'll have to pass it quoted if it contains spaces
            ]
                .concat(command.args)
                .concat('"'); // enforce closing quote
            log(`System command: ${process.env.comspec || 'cmd.exe'} ${allArgs.join(' ')}`);
            // switch the command to cmd shell instead of the original command
            ls = node_child_process_1.default.spawn(process.env.comspec || 'cmd.exe', allArgs, { windowsVerbatimArguments: true });
        }
        else {
            const binary = findPingBinary(command.binary);
            log(`System command: ${binary} ${command.args.join(' ')}`);
            ls = node_child_process_1.default.spawn(binary, command.args);
        }
    }
    catch (e) {
        callback?.(new Error(`ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`));
        return;
    }
    // After this point, use a mutable callback ref to prevent double-calling
    let cb = callback;
    // The binary has no option for the timeout (ping6 of macOS and FreeBSD): stop it from here
    let killTimer = null;
    if (command.killAfter !== null) {
        const child = ls;
        killTimer = setTimeout(() => {
            killTimer = null;
            log(`No answer from ${host} within ${command.killAfter} ms, stopping ${command.binary}`);
            child.kill();
        }, command.killAfter);
    }
    const stopKillTimer = () => {
        if (killTimer) {
            clearTimeout(killTimer);
            killTimer = null;
        }
    };
    ls.on('error', (e) => {
        stopKillTimer();
        cb?.(new Error(`ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`));
        cb = null;
    });
    if (ls.stderr) {
        ls.stderr.on('data', (data) => {
            // Kept, and remembered: without it a host that may not open an ICMP socket looks
            // exactly like a network full of offline devices, and nothing says why.
            errString += String(data);
            log(`STDERR: ${data.toString()}`);
        });
        ls.stderr.on('error', (e) => {
            cb?.(new Error(`ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`));
            cb = null;
        });
    }
    if (ls.stdout) {
        ls.stdout.on('data', (data) => (outString += String(data)));
        ls.stdout.on('error', (e) => {
            cb?.(new Error(`ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`));
            cb = null;
        });
    }
    ls.on('exit', (code) => {
        stopKillTimer();
        const ms = parsePingTime(outString);
        // Windows: only a reply with a time proves an answer. Elsewhere the exit code says it - a process ended by
        // a signal (code null), e.g. by the kill timer above, got none.
        const alive = command.binary === 'ping.exe' ? ms !== null : code === 0;
        const error = errString.trim();
        cb?.(null, {
            host: addr,
            alive,
            ms,
            error: error || undefined,
            denied: (0, pingFallback_1.isPermissionError)(error),
        });
        cb = null;
    });
}
//# sourceMappingURL=ping.js.map