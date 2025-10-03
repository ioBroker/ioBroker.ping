const cp = require('node:child_process');
const net = require('node:net');
const p = require('node:os').platform().toLowerCase();

/**
 * Parse host and port from address string
 *
 * @param {string} addr - Address in format "host" or "host:port"
 * @returns {{host: string, port: number|null}} Parsed host and port
 */
function parseAddress(addr) {
    const match = addr.match(/^(.+):(\d+)$/);
    if (match) {
        return { host: match[1], port: parseInt(match[2], 10) };
    }
    return { host: addr, port: null };
}

/**
 * Check TCP port connectivity
 *
 * @param {string} host - Hostname or IP address
 * @param {number} port - TCP port number
 * @param {object} config - Configuration object
 * @param {Function} callback - Callback function
 */
function probeTcpPort(host, port, config, callback) {
    const log = config.log || console.log;
    const timeout = config.timeout * 1000 || 2000;
    const startTime = Date.now();

    log(`Checking TCP port ${host}:${port}`);

    const socket = new net.Socket();
    let timeoutHandle;
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
            callback &&
                callback(null, {
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

    socket.on('error', err => {
        log(`TCP port check error: ${err.message}`);
        returnResult(false, null);
    });

    socket.connect(port, host);
}

function probe(addr, config, callback) {
    config = config || {};

    // Check if address contains a port
    const parsed = parseAddress(addr);
    if (parsed.port !== null) {
        // Use TCP port check
        return probeTcpPort(parsed.host, parsed.port, config, callback);
    }

    let ls = null;
    const log = config.log || console.log;
    let outString = '';

    config = {
        numeric: config.numeric === undefined ? true : config.numeric,
        timeout: parseInt(config.timeout === undefined ? 2 : config.timeout, 10),
        minReply: parseInt(config.minReply === undefined ? 1 : config.minReply, 10),
        extra: config.extra || [],
    };

    let args = [];
    const xFamily = ['linux', 'sunos', 'unix'];
    const regex = /=.*[<|=]([0-9]*).*TTL|ttl..*=([0-9.]*)/;

    try {
        if (xFamily.includes(p)) {
            //linux
            args = [];
            if (config.numeric !== false) {
                args.push('-n');
            }

            if (config.timeout !== false) {
                args.push('-w', config.timeout);
            }

            if (config.minReply !== false) {
                args.push('-c', config.minReply);
            }

            if (config.extra !== false) {
                args = args.concat(config.extra);
            }

            args.push(addr);
            log(`System command: /bin/ping ${args.join(' ')}`);
            ls = cp.spawn('/bin/ping', args);
        } else if (p.match(/^win/)) {
            //windows
            args = [];
            if (config.minReply !== false) {
                args.push(`-n ${config.minReply}`);
            }

            if (config.timeout !== false) {
                args.push(`-w ${config.timeout * 1000}`);
            }

            if (config.extra !== false) {
                args = args.concat(config.extra);
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
            ls = cp.spawn(process.env.comspec || 'cmd.exe', allArgs, { windowsVerbatimArguments: true });
        } else if (p === 'darwin' || p === 'freebsd') {
            // Mac OS X or freebsd
            args = [];
            if (config.numeric !== false) {
                args.push('-n');
            }

            if (config.timeout !== false) {
                args.push(`-t ${config.timeout}`);
            }

            if (config.minReply !== false) {
                args.push(`-c ${config.minReply}`);
            }

            if (config.extra !== false) {
                args = args.concat(config.extra);
            }

            args.push(addr);
            log(`System command: /sbin/ping ${args.join(' ')}`);
            ls = cp.spawn('/sbin/ping', args);
        } else {
            return callback && callback(`Your platform "${p}" is not supported`);
        }
    } catch (e) {
        return (
            callback &&
            callback(
                new Error(
                    `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
                ),
            )
        );
    }

    ls.on('error', e => {
        callback &&
            callback(
                new Error(
                    `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
                ),
            );
        callback = null;
    });

    if (ls.stderr) {
        ls.stderr.on('data', data => log(`STDERR: ${data}`));
        ls.stderr.on('error', e => {
            callback &&
                callback(
                    new Error(
                        `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
                    ),
                );
            callback = null;
        });
    }

    if (ls.stdout) {
        ls.stdout.on('data', data => (outString += String(data)));
        ls.stdout.on('error', e => {
            callback &&
                callback(
                    new Error(
                        `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
                    ),
                );
            callback = null;
        });
    }

    ls.on('exit', code => {
        const lines = outString.split('\n');
        let ms = null;
        let result = 1;

        for (let t = 0; t < lines.length; t++) {
            const m = regex.exec(lines[t]) || '';
            if (m !== '') {
                ms = m[1] || m[2];
                result = 0;
                break;
            }
        }

        if (p.match(/^win/)) {
            result = ms !== null;
        } else {
            result = !code;
        }

        callback &&
            callback(null, {
                host: addr,
                alive: result,
                ms,
            });

        callback = null;
    });
}

exports.probe = probe;
exports.parseAddress = parseAddress;
