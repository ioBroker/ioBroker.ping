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
    return new Promise((resolve, reject) => {
        cp.exec('which ping', (err, stdout /*, stderr */) => {
            if (err) {
                reject(new Error('Could not find ping'));
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
                cp.exec(`sudo setcap cap_net_raw+ep ${path}`, (err /*, stdout, stderr */) => {
                    if (err) {
                        reject(new Error('Could not allow ping'));
                    }
                    resolve();
                });
            } else {
                reject(new Error('Could not allow ping'));
            }
        });
    });
}
