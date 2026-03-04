"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLinux = isLinux;
exports.isHping3Available = isHping3Available;
exports.installHping3 = installHping3;
const node_child_process_1 = __importDefault(require("node:child_process"));
const node_os_1 = require("node:os");
const p = (0, node_os_1.platform)().toLowerCase();
function isLinux() {
    return p.startsWith('linux');
}
function isHping3Available() {
    return new Promise(resolve => {
        if (!isLinux()) {
            resolve(false);
            return;
        }
        node_child_process_1.default.exec('which hping3', err => resolve(!err));
    });
}
function installHping3() {
    return new Promise((resolve, reject) => {
        if (!isLinux()) {
            reject(new Error('hping3 is only available on Linux'));
            return;
        }
        node_child_process_1.default.exec('sudo apt-get install -y hping3', err => {
            if (err) {
                reject(new Error(`Cannot install hping3: ${err.message}`));
            }
            else {
                resolve();
            }
        });
    });
}
//# sourceMappingURL=hping3.js.map