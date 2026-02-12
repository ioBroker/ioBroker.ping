const fs = require('node:fs');
const cp = require('node:child_process');
const p = require('node:os').platform().toLowerCase();

// find out the path to ping
async function pingPath() {
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
function allowPing() {
    return new Promise((resolve, reject) => {
        pingPath().then(path => {
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

module.exports = allowPing;
