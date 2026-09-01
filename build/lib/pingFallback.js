"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TCP_PORTS = void 0;
exports.isPermissionError = isPermissionError;
exports.classifyConnectError = classifyConnectError;
exports.parsePorts = parsePorts;
exports.deniedHint = deniedHint;
exports.probeTcp = probeTcp;
/**
 * What to do on a host that is not allowed to send ICMP.
 *
 * In an unprivileged LXC container - and in some docker images - `/bin/ping` has neither
 * `cap_net_raw` nor a `net.ipv4.ping_group_range` that covers the ioBroker user. Every ping
 * then fails before a single packet leaves the host, and the adapter reports every configured
 * device as offline without a word about why. TCP sockets are not affected by that
 * restriction, so a device can still be asked whether it is there - with a connect instead of
 * an echo request.
 *
 * The `setcap` option of this adapter repairs the cause; this file is what happens until
 * somebody switches it on.
 */
const node_net_1 = __importDefault(require("node:net"));
/**
 * Everything a ping writes to stderr when it may not open its socket at all.
 *
 * `sendmsg: Operation not permitted` is a local firewall dropping the echo request instead -
 * the consequence is the same, ICMP cannot be used from here.
 */
const deniedPatterns = [
    /operation not permitted/i,
    /permission denied/i,
    /are you root/i,
    /root privilege/i,
    /must be root/i,
    /cap_net_raw/i,
    /lacking privilege/i,
];
/** True when the ping process failed because it may not send ICMP, not because the host is away */
function isPermissionError(text) {
    if (!text) {
        return false;
    }
    return deniedPatterns.some(pattern => pattern.test(text));
}
/**
 * Ports a device on a home network answers on most often.
 *
 * A connect is only half of the evidence: a host that refuses the connection (RST) proves it
 * is there just as well as one that accepts it, so a closed port is not a wasted probe.
 */
exports.DEFAULT_TCP_PORTS = [80, 443, 22, 8080, 8443, 1883];
/**
 * What a failed connect says about the host.
 *
 * `ECONNREFUSED` and `ECONNRESET` are answers - something at that address processed the SYN.
 * A timeout, `EHOSTUNREACH` (nobody answered the ARP request) or `ENETUNREACH` say nothing
 * more than "no answer", and `EACCES`/`EPERM` is the local firewall blocking us.
 */
function classifyConnectError(code) {
    return code === 'ECONNREFUSED' || code === 'ECONNRESET' ? 'alive' : 'unknown';
}
/** Read the configured port list; anything unusable falls back to {@link DEFAULT_TCP_PORTS} */
function parsePorts(value, fallback = exports.DEFAULT_TCP_PORTS) {
    if (Array.isArray(value)) {
        value = value.join(',');
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
        return [...fallback];
    }
    const ports = [];
    for (const part of String(value).split(/[,;\s]+/)) {
        const port = parseInt(part, 10);
        if (port > 0 && port < 65536 && !ports.includes(port)) {
            ports.push(port);
        }
    }
    return ports.length ? ports : [...fallback];
}
/**
 * The lines the log shows once when ping turned out to be unusable.
 *
 * They name what repairs it, because none of it can be done from here on the quiet: `setcap`
 * needs root, and this adapter asks for that permission with a checkbox of its own.
 */
function deniedHint(stderr, ports) {
    const lines = [
        `This host may not send ICMP packets, so every device would be reported as offline${stderr ? `: ${stderr.split('\n')[0]}` : ''}`,
        'That is the normal state of an unprivileged LXC container. Switch on "Allow with setcap the required ' +
            'rights for ping" in the instance settings, or run as root in this container: ' +
            'setcap cap_net_raw+ep $(which ping) - or allow unprivileged ICMP for everyone with ' +
            'sysctl -w net.ipv4.ping_group_range="0 2147483647", which usually has to be done on the container host. ' +
            'A system update can reset both again.',
    ];
    lines.push(ports?.length
        ? `Checking the devices over TCP instead, on the ports ${ports.join(', ')} - a device that answers on none of them stays "offline".`
        : 'Switch on "Check over TCP when ping is not permitted" in the instance settings to keep the devices monitored until then.');
    return lines;
}
/**
 * Ask an address over TCP whether anybody is there.
 *
 * Every port is tried at the same time and the first answer of any kind - an open port or a
 * refusal - ends the probe.
 */
function probeTcp(host, ports, timeout, callback) {
    if (!ports.length) {
        setImmediate(callback, { alive: false, ms: null });
        return;
    }
    const started = Date.now();
    const sockets = [];
    let pending = ports.length;
    let answered = false;
    const finish = (alive, port) => {
        if (answered) {
            return;
        }
        answered = true;
        sockets.forEach(socket => socket.destroy());
        callback({ alive, ms: alive ? Date.now() - started : null, port: alive ? port : undefined });
    };
    const settle = () => {
        if (!--pending && !answered) {
            finish(false);
        }
    };
    for (const port of ports) {
        const socket = new node_net_1.default.Socket();
        let done = false;
        // A socket may report both a timeout and an error - count it once
        const once = (fn) => {
            if (!done) {
                done = true;
                fn();
            }
        };
        sockets.push(socket);
        socket.setTimeout(timeout);
        socket.on('connect', () => once(() => finish(true, port)));
        socket.on('timeout', () => once(() => {
            socket.destroy();
            settle();
        }));
        socket.on('error', (error) => once(() => {
            if (classifyConnectError(error?.code) === 'alive') {
                finish(true, port);
            }
            else {
                settle();
            }
        }));
        socket.connect(port, host);
    }
}
//# sourceMappingURL=pingFallback.js.map