"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = allowPing;
const node_fs_1 = __importDefault(require("node:fs"));
const node_child_process_1 = __importDefault(require("node:child_process"));
const node_os_1 = require("node:os");
const p = (0, node_os_1.platform)().toLowerCase();
// find out the path to ping
async function pingPath() {
    if (p === 'win32') {
        return '';
    }
    if (node_fs_1.default.existsSync('/bin/ping')) {
        return '/bin/ping';
    }
    if (node_fs_1.default.existsSync('/sbin/ping')) {
        return '/sbin/ping';
    }
    if (node_fs_1.default.existsSync('/usr/bin/ping')) {
        return '/usr/bin/ping';
    }
    return new Promise((resolve, reject) => {
        node_child_process_1.default.exec('which ping', (err, stdout /*, stderr */) => {
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
                node_child_process_1.default.exec(`sudo setcap cap_net_raw+ep ${path}`, (err /*, stdout, stderr */) => {
                    if (err) {
                        reject(new Error('Could not allow ping'));
                    }
                    resolve();
                });
            }
            else {
                reject(new Error('Could not allow ping'));
            }
        });
    });
}
//# sourceMappingURL=setcup.js.map