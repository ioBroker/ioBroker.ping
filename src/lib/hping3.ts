import cp from 'node:child_process';
import { platform } from 'node:os';

const p = platform().toLowerCase();

export function isLinux(): boolean {
    return p.startsWith('linux');
}

export function isHping3Available(): Promise<boolean> {
    return new Promise(resolve => {
        if (!isLinux()) {
            resolve(false);
            return;
        }
        cp.exec('which hping3', err => resolve(!err));
    });
}

export function installHping3(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!isLinux()) {
            reject(new Error('hping3 is only available on Linux'));
            return;
        }
        cp.exec('sudo apt-get install -y hping3', err => {
            if (err) {
                reject(new Error(`Cannot install hping3: ${err.message}`));
            } else {
                resolve();
            }
        });
    });
}
