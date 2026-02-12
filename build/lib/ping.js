"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAddress = parseAddress;
exports.probe = probe;
const node_child_process_1 = __importDefault(require("node:child_process"));
const node_net_1 = __importDefault(require("node:net"));
const node_os_1 = require("node:os");
const p = (0, node_os_1.platform)().toLowerCase();
function parseAddress(addr) {
    const match = addr.match(/^(.+):(\d+)$/);
    if (match) {
        return { host: match[1], port: parseInt(match[2], 10) };
    }
    return { host: addr, port: null };
}
function probeTcpPort(host, port, config, callback) {
    const log = config.log || console.log;
    const timeout = (config.timeout || 2) * 1000;
    const startTime = Date.now();
    log(`Checking TCP port ${host}:${port}`);
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
    const returnResult = (alive, ms) => {
        if (!callbackCalled) {
            callbackCalled = true;
            cleanup();
            callback?.(null, {
                host: `${host}:${port}`,
                alive,
                ms,
            });
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
    socket.connect(port, host);
}
function probe(addr, config, callback) {
    config ||= {};
    // Check if the address contains a port
    const parsed = parseAddress(addr);
    if (parsed.port !== null) {
        // Use TCP port check
        return probeTcpPort(parsed.host, parsed.port, config, callback);
    }
    let ls = null;
    const log = config.log || console.log;
    let outString = '';
    const resolvedConfig = {
        numeric: config.numeric === undefined ? true : config.numeric,
        timeout: parseInt(String(config.timeout === undefined ? 2 : config.timeout), 10),
        minReply: parseInt(String(config.minReply === undefined ? 1 : config.minReply), 10),
        extra: config.extra || [],
    };
    let args = [];
    const xFamily = ['linux', 'sunos', 'unix'];
    const regex = /=.*[<|=]([0-9]*).*TTL|ttl..*=([0-9.]*)/;
    try {
        if (xFamily.includes(p)) {
            //linux
            args = [];
            if (resolvedConfig.numeric !== false) {
                args.push('-n');
            }
            if (resolvedConfig.timeout !== false) {
                args.push('-w', String(resolvedConfig.timeout));
            }
            if (resolvedConfig.minReply !== false) {
                args.push('-c', String(resolvedConfig.minReply));
            }
            if (resolvedConfig.extra !== false) {
                args = args.concat(resolvedConfig.extra);
            }
            args.push(addr);
            log(`System command: /bin/ping ${args.join(' ')}`);
            ls = node_child_process_1.default.spawn('/bin/ping', args);
        }
        else if (p.match(/^win/)) {
            //windows
            args = [];
            if (resolvedConfig.minReply !== false) {
                args.push(`-n ${resolvedConfig.minReply}`);
            }
            if (resolvedConfig.timeout !== false) {
                args.push(`-w ${resolvedConfig.timeout * 1000}`);
            }
            if (resolvedConfig.extra !== false) {
                args = args.concat(resolvedConfig.extra);
            }
            args.push(addr);
            const allArgs = [
                '/s', // leave quotes as they are
                '/c', // run and exit
                // !!! the order of c and s is important - c must come last!!!
                '"', // enforce starting quote
                `${process.env.SystemRoot}\\system32\\ping.exe`, // command itself. Notice that you'll have to pass it quoted if it contains spaces
            ]
                .concat(args)
                .concat('"'); // enforce closing quote
            log(`System command: ${process.env.comspec || 'cmd.exe'} ${allArgs.join(' ')}`);
            // switch the command to cmd shell instead of the original command
            ls = node_child_process_1.default.spawn(process.env.comspec || 'cmd.exe', allArgs, { windowsVerbatimArguments: true });
        }
        else if (p === 'darwin' || p === 'freebsd') {
            // Mac OS X or freebsd
            args = [];
            if (resolvedConfig.numeric !== false) {
                args.push('-n');
            }
            if (resolvedConfig.timeout !== false) {
                args.push(`-t ${resolvedConfig.timeout}`);
            }
            if (resolvedConfig.minReply !== false) {
                args.push(`-c ${resolvedConfig.minReply}`);
            }
            if (resolvedConfig.extra !== false) {
                args = args.concat(resolvedConfig.extra);
            }
            args.push(addr);
            log(`System command: /sbin/ping ${args.join(' ')}`);
            ls = node_child_process_1.default.spawn('/sbin/ping', args);
        }
        else {
            callback?.(`Your platform "${p}" is not supported`);
            return;
        }
    }
    catch (e) {
        callback?.(new Error(`ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`));
        return;
    }
    // After this point, use a mutable callback ref to prevent double-calling
    let cb = callback;
    ls.on('error', (e) => {
        cb?.(new Error(`ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`));
        cb = null;
    });
    if (ls.stderr) {
        ls.stderr.on('data', (data) => log(`STDERR: ${data.toString()}`));
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
        const lines = outString.split('\n');
        let ms = null;
        let alive;
        for (let t = 0; t < lines.length; t++) {
            const m = regex.exec(lines[t]);
            if (m) {
                ms = parseFloat(m[1] || m[2]);
                break;
            }
        }
        if (p.match(/^win/)) {
            alive = ms !== null;
        }
        else {
            alive = !code;
        }
        cb?.(null, {
            host: addr,
            alive,
            ms,
        });
        cb = null;
    });
}
//# sourceMappingURL=ping.js.map