import fs from 'node:fs';
import cp from 'node:child_process';
import { platform } from 'node:os';

const p = platform().toLowerCase();

// find out the path to ping
async function pingPath(): Promise<string> {
    if (p === 'win32') {
        return '';
    }
    if (fs.existsSync('/bin/ping')) {
        return '/bin/ping';
    }
    if (fs.existsSync('/sbin/ping')) {
        return '/sbin/ping';
    }
    if (fs.existsSync('/usr/bin/ping')) {
        return '/usr/bin/ping';
    }
    if (fs.existsSync('/usr/sbin/ping')) {
        return '/usr/sbin/ping';
    }
    return new Promise((resolve, reject) => {
        cp.exec('which ping', (err, stdout /*, stderr */) => {
            if (err) {
                reject(new Error('Could not find ping'));
                return;
            }
            resolve(stdout.trim());
        });
    });
}

// allow ping execution
export default function allowPing(): Promise<void> {
    return new Promise((resolve, reject) => {
        void pingPath().then(path => {
            if (path) {
                // In a container the adapter often runs as root, where no sudo is installed at all
                const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
                const command = `${asRoot ? '' : 'sudo '}setcap cap_net_raw+ep ${path}`;

                cp.exec(command, (err, _stdout, stderr) => {
                    if (err) {
                        // Say what went wrong: without the reason nobody can tell a missing
                        // sudo from a read-only file system or a container without CAP_SETFCAP
                        reject(new Error(`Could not allow ping ("${command}"): ${stderr?.trim() || err.message}`));
                        return;
                    }
                    resolve();
                });
            } else {
                reject(new Error('Could not allow ping'));
            }
        }, reject);
    });
}
