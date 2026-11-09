import cp from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import { platform } from 'node:os';

import { isPermissionError } from './pingFallback';
import { sendUdpBurst, UDP_WAKE_SETTLE } from './udpWake';

const p = platform().toLowerCase();

export interface PingResult {
    host: string;
    alive: boolean;
    ms: number | null;
    /**
     * What went wrong: what the ping process wrote to stderr, when it wrote anything, or why the address
     * could not be checked at all (e.g. a TCP port outside 1-65535)
     */
    error?: string;
    /** The process was not allowed to send ICMP at all - see `lib/pingFallback.ts` */
    denied?: boolean;
}

/**
 * A ping binary of this host: `ping`, or `ping6` for IPv6 on macOS and FreeBSD.
 *
 * Not every system keeps it in `/bin`: macOS and FreeBSD have `/sbin/ping` and `/sbin/ping6`, and a container
 * built without the usr-merge may only carry `/usr/bin/ping`. The bare name as the last resort lets PATH decide
 * instead of failing with ENOENT.
 */
function findPingBinary(name: 'ping' | 'ping6'): string {
    for (const dir of ['/bin', '/usr/bin', '/sbin', '/usr/sbin']) {
        const candidate = `${dir}/${name}`;
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return name;
}

export interface PingConfig {
    numeric?: boolean;
    timeout?: number;
    minReply?: number;
    extra?: string[];
    log?: (...args: any[]) => void;
    /** Wake the device with a UDP burst before the ping - see `lib/udpWake.ts` */
    udpWake?: boolean;
}

export type PingCallback = (err: Error | string | null, result?: PingResult) => void;

export interface ParsedAddress {
    /** What is pinged or connected to - an IPv6 address without its brackets */
    host: string;
    /** The port of a TCP check, `null` for a ping */
    port: number | null;
    /**
     * Set when the address names a port outside 1-65535: nothing is checked, `probe()` reports the address as not
     * alive with this text as `error`. `port` is then the number as written.
     */
    error?: string;
}

/** The ports a TCP check can connect to */
const MIN_PORT = 1;
const MAX_PORT = 65535;

/** The host and the port of a TCP check - or why the port is not one */
function withPort(addr: string, host: string, digits: string): ParsedAddress {
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
export function parseAddress(addr: string): ParsedAddress {
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
function formatAddress(host: string, port: number): string {
    return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

function probeTcpPort(host: string, port: number, config: PingConfig, callback: PingCallback): void {
    const log = config.log || console.log;
    const timeout = (config.timeout || 2) * 1000;
    const startTime = Date.now();
    const address = formatAddress(host, port);

    log(`Checking TCP port ${address}`);

    const socket = new net.Socket();
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let callbackCalled = false;

    const cleanup = (): void => {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
        }
        socket.destroy();
    };

    const returnResult = (alive: boolean, ms: number | null, error?: string): void => {
        if (!callbackCalled) {
            callbackCalled = true;
            cleanup();
            const result: PingResult = { host: address, alive, ms };
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

    socket.on('error', (err: Error) => {
        log(`TCP port check error: ${err.message}`);
        returnResult(false, null);
    });

    try {
        socket.connect(port, host);
    } catch (err) {
        // connect() throws some errors at once instead of emitting them (ERR_SOCKET_BAD_PORT, invalid arguments).
        // That must not escape probe(): it is the result of this address, reported like every other one later.
        const message = err instanceof Error ? err.message : String(err);
        log(`TCP port check error: ${message}`);
        setImmediate(() => returnResult(false, null, message));
    }
}

function wakeWithUdpBurst(host: string, log: (...args: any[]) => void, callback: () => void): void {
    log(`UDP wake: burst to ${host}`);
    const pingLater = (): void => {
        setTimeout(callback, UDP_WAKE_SETTLE);
    };
    sendUdpBurst(host).then(pingLater, (e: Error) => {
        log(`UDP wake error (pinging anyway): ${e.message}`);
        pingLater();
    });
}

/** The options of one ping, resolved from {@link PingConfig} */
export interface PingOptions {
    /** Numeric output only - no reverse lookup of the address that answers */
    numeric: boolean;
    /** Seconds to wait for the answer, `false` for the default of the binary */
    timeout: number | false;
    /** Number of echo requests, `false` for the default of the binary */
    minReply: number | false;
    /** Further arguments, passed as they are */
    extra: string[] | false;
}

/** Which program pings and how - see {@link buildPingCommand} */
export interface PingCommand {
    /**
     * - `ping`: the ping binary of this host, see `findPingBinary()`
     * - `ping6`: IPv6 on macOS and FreeBSD, whose `/sbin/ping` only knows IPv4
     * - `ping.exe`: Windows, started through `cmd.exe`
     */
    binary: 'ping' | 'ping6' | 'ping.exe';
    /** The arguments, the host last */
    args: string[];
    /**
     * Stop the process after this many ms, because the binary has no option for the time to wait: `ping6` of macOS
     * (and the old KAME `ping6` of FreeBSD) has no timeout - its `-t` and `-w` ask for node information instead -
     * and waits 10 s for a device that does not answer. `null`: the binary stops by itself.
     */
    killAfter: number | null;
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
export function buildPingCommand(platform: string, host: string, options: PingOptions): PingCommand | null {
    const extra = options.extra || [];

    if (['linux', 'sunos', 'unix'].includes(platform)) {
        const args: string[] = [];
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
        const args: string[] = [];
        if (options.minReply !== false) {
            args.push('-n', String(options.minReply));
        }
        if (options.timeout !== false) {
            args.push('-w', String(options.timeout * 1000));
        }
        return { binary: 'ping.exe', args: [...args, ...extra, host], killAfter: null };
    }

    if (platform === 'darwin' || platform === 'freebsd') {
        const ipv6 = net.isIPv6(host);
        const args: string[] = [];
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
export function parsePingTime(output: string): number | null {
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

export function probe(addr: string, config: PingConfig | undefined, callback: PingCallback): void {
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

    let ls: cp.ChildProcess | null = null;
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
            ls = cp.spawn(process.env.comspec || 'cmd.exe', allArgs, { windowsVerbatimArguments: true });
        } else {
            const binary = findPingBinary(command.binary);
            log(`System command: ${binary} ${command.args.join(' ')}`);
            ls = cp.spawn(binary, command.args);
        }
    } catch (e) {
        callback?.(
            new Error(
                `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
            ),
        );
        return;
    }

    // After this point, use a mutable callback ref to prevent double-calling
    let cb: PingCallback | null = callback;

    // The binary has no option for the timeout (ping6 of macOS and FreeBSD): stop it from here
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    if (command.killAfter !== null) {
        const child = ls;
        killTimer = setTimeout(() => {
            killTimer = null;
            log(`No answer from ${host} within ${command.killAfter} ms, stopping ${command.binary}`);
            child.kill();
        }, command.killAfter);
    }
    const stopKillTimer = (): void => {
        if (killTimer) {
            clearTimeout(killTimer);
            killTimer = null;
        }
    };

    ls.on('error', (e: Error) => {
        stopKillTimer();
        cb?.(
            new Error(
                `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
            ),
        );
        cb = null;
    });

    if (ls.stderr) {
        ls.stderr.on('data', (data: Buffer) => {
            // Kept, and remembered: without it a host that may not open an ICMP socket looks
            // exactly like a network full of offline devices, and nothing says why.
            errString += String(data);
            log(`STDERR: ${data.toString()}`);
        });
        ls.stderr.on('error', (e: Error) => {
            cb?.(
                new Error(
                    `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
                ),
            );
            cb = null;
        });
    }

    if (ls.stdout) {
        ls.stdout.on('data', (data: Buffer) => (outString += String(data)));
        ls.stdout.on('error', (e: Error) => {
            cb?.(
                new Error(
                    `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
                ),
            );
            cb = null;
        });
    }

    ls.on('exit', (code: number | null) => {
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
            denied: isPermissionError(error),
        });

        cb = null;
    });
}
