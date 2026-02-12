import cp from 'node:child_process';
import net from 'node:net';
import { platform } from 'node:os';

const p = platform().toLowerCase();

export interface PingResult {
    host: string;
    alive: boolean;
    ms: number | null;
}

export interface PingConfig {
    numeric?: boolean;
    timeout?: number;
    minReply?: number;
    extra?: string[];
    log?: (...args: any[]) => void;
}

export type PingCallback = (err: Error | string | null, result?: PingResult) => void;

interface ParsedAddress {
    host: string;
    port: number | null;
}

export function parseAddress(addr: string): ParsedAddress {
    const match = addr.match(/^(.+):(\d+)$/);
    if (match) {
        return { host: match[1], port: parseInt(match[2], 10) };
    }
    return { host: addr, port: null };
}

function probeTcpPort(host: string, port: number, config: PingConfig, callback: PingCallback): void {
    const log = config.log || console.log;
    const timeout = (config.timeout || 2) * 1000;
    const startTime = Date.now();

    log(`Checking TCP port ${host}:${port}`);

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

    const returnResult = (alive: boolean, ms: number | null): void => {
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

    socket.on('error', (err: Error) => {
        log(`TCP port check error: ${err.message}`);
        returnResult(false, null);
    });

    socket.connect(port, host);
}

export function probe(addr: string, config: PingConfig | undefined, callback: PingCallback): void {
    config ||= {};

    // Check if the address contains a port
    const parsed = parseAddress(addr);
    if (parsed.port !== null) {
        // Use TCP port check
        return probeTcpPort(parsed.host, parsed.port, config, callback);
    }

    let ls: cp.ChildProcess | null = null;
    const log = config.log || console.log;
    let outString = '';

    const resolvedConfig: {
        numeric: boolean;
        timeout: number | false;
        minReply: number | false;
        extra: string[] | false;
    } = {
        numeric: config.numeric === undefined ? true : config.numeric,
        timeout: parseInt(String(config.timeout === undefined ? 2 : config.timeout), 10),
        minReply: parseInt(String(config.minReply === undefined ? 1 : config.minReply), 10),
        extra: config.extra || [],
    };

    let args: string[] = [];
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
            ls = cp.spawn('/bin/ping', args);
        } else if (p.match(/^win/)) {
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
            ls = cp.spawn(process.env.comspec || 'cmd.exe', allArgs, { windowsVerbatimArguments: true });
        } else if (p === 'darwin' || p === 'freebsd') {
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
            ls = cp.spawn('/sbin/ping', args);
        } else {
            callback?.(`Your platform "${p}" is not supported`);
            return;
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

    ls.on('error', (e: Error) => {
        cb?.(
            new Error(
                `ping.probe: there was an error while executing the ping program. check the path or permissions...: ${e}`,
            ),
        );
        cb = null;
    });

    if (ls.stderr) {
        ls.stderr.on('data', (data: Buffer) => log(`STDERR: ${data.toString()}`));
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
        const lines = outString.split('\n');
        let ms: number | null = null;
        let alive: boolean;

        for (let t = 0; t < lines.length; t++) {
            const m = regex.exec(lines[t]);
            if (m) {
                ms = parseFloat(m[1] || m[2]);
                break;
            }
        }

        if (p.match(/^win/)) {
            alive = ms !== null;
        } else {
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
