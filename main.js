/**
 *
 *      ioBroker PING Adapter
 *
 *      (c) 2014-2024 bluefox <dogafox@gmail.com>
 *
 *      MIT License
 *
 */
/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */

'use strict';
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const ip = require('ip');
const ping = require('./lib/ping');
const allowPing = require('./lib/setcup');
const adapterName = require('./package.json').name.split('.').pop();
let adapter;

let arp;
let vendor;
let timer = null;
let timerUnreach = null;
let isStopping = false;

const FORBIDDEN_CHARS = /[\]\[*,;'"`<>\\?]/g;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {name: adapterName});

    adapter = new utils.Adapter(options);

    adapter.on('message', obj => obj && obj.command && processMessage(obj));

    adapter.on('ready', () => main(adapter));

    adapter.on('unload', () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (timerUnreach) {
            clearTimeout(timerUnreach);
            timerUnreach = null;
        }

        isStopping = true;
    });

    adapter.on('stateChange', async (id, state) => {
        if (state && !state.val && !state.ack && id.endsWith('.browse.running')) {
            stopBrowsing = true;
        }
    });

    return adapter;
}

let runningTs = 0;
let stopBrowsing = false;

async function browse(iface) {
    if (!iface || typeof iface === 'string') {
        if (!iface) {
            // read last selected interface
            const iState = await adapter.getStateAsync('browse.interface');
            // if nothing selected, nothing to do
            if (!iState || !iState.val) {
                adapter.log.warn('No interface selected');
                return [];
            }
            iface = iState.val;
        }
        // get the host where this instance is running
        const config = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        // read the host interfaces
        const host = await this.getForeignObjectAsync(`system.host.${config.common.host}`);
        if (host?.native?.hardware?.networkInterfaces) {
            for (const iName of Object.keys(host.native.hardware.networkInterfaces)) {
                const ifc = host.native.hardware.networkInterfaces[iName];
                const _addr = ifc.find(addr => addr.address === iface);
                if (_addr) {
                    iface = { ip: _addr.address, netmask: _addr.netmask };
                    break;
                }
            }
        }
        if (!iface) {
            return [];
        }
    } else {
        const iState = await adapter.getStateAsync('browse.interface');
        if (!iState || iState.val !== iface.ip) {
            await adapter.setStateAsync('browse.interface', iface.ip, true);
        }
    }

    try {
        vendor = vendor || require('@network-utils/vendor-lookup');
        arp =  arp || require('@network-utils/arp-lookup');
    } catch (e) {
        adapter.log.warn('Cannot use module "arp-lookup"');
    }

    const now = Date.now();
    runningTs = now;

    const result = ip.subnet(iface.ip, iface.netmask);
    if (result.length > 5000) {
        return [];
    }
    const res = [];
    let progress = 0;
    await adapter.setStateAsync('browse.result', JSON.stringify(res), true);
    await adapter.setStateAsync('browse.running', true, true);
    await adapter.setStateAsync('browse.progress', 0, true);
    await adapter.setStateAsync('browse.status', `0 / ${result.length}`, true);

    stopBrowsing = false;
    let addr = result.firstAddress;
    for (let i = 0; i < result.length; i++) {
        // ping addr
        progress = Math.round((i / result.length) * 255);
        await new Promise(resolve => ping.probe(addr, { log: adapter.log.debug }, async (_err, status) => {
            if (status?.alive) {
                console.log(`Found ${status.host}`);
                let mac = undefined;
                let vendorName = undefined;
                if (arp) {
                    mac = await arp.toMAC(status.host);
                    if (mac && vendor) {
                        vendorName = vendor.toVendor(mac);
                    }
                }
                res.push({ ip: status.host, mac, vendor: vendorName });
                adapter.setState('browse.result', JSON.stringify(res), true);
            } else {
                console.log(`Progress ${progress} / 255`);
            }
            resolve();
        }));

        if (runningTs !== now) {
            break;
        }

        if (stopBrowsing) {
            break;
        }

        addr = ip.toLong(addr) + 1;
        addr = ip.fromLong(addr);

        await adapter.setStateAsync('browse.status', `${i} / ${result.length}`, true);
        await adapter.setStateAsync('browse.progress', progress, true);
    }
    await adapter.setStateAsync('browse.running', false, true);
    await adapter.setStateAsync('browse.progress', 0, true);
    stopBrowsing = false;

    return res;
}

function processMessage(obj) {
    switch (obj.command) {
        case 'ping': {
            // Try to ping one IP or name
            if (obj.callback && obj.message) {
                ping.probe(obj.message, { log: adapter.log.debug }, (err, result) =>
                    adapter.sendTo(obj.from, obj.command, { result, error: err }, obj.callback));
            }
            break;
        }

        case 'browse': {
            // Try to ping all IPs of the network
            if (obj.callback) {
                browse(obj.message)
                    .then(result => adapter.sendTo(obj.from, obj.command, { result }, obj.callback));
            }
            break;
        }
    }
}

async function pingAll(taskList, isUnreach) {
    for (let t = 0; t < taskList.length; t++) {
        const task = taskList[t];
        if ((isUnreach && task.online) || (!isUnreach && !task.online)) {
            continue;
        }

        adapter.log.debug(`Pinging ${isUnreach ? 'offline' : 'alive'} ${task.host}`);

        let counter = 0;
        do {
            const result = await pingSingleDevice(task, counter);
            if (result || isStopping) {
                break;
            }
            counter++;
        } while (counter <= adapter.config.numberOfRetries);

        if (isStopping) {
            break;
        }
    }

    // start next ping
    if (!isStopping) {
        if (isUnreach) {
            timerUnreach = setTimeout(async () => {
                timerUnreach = null;
                await pingAll(taskList, true);
            }, adapter.config.intervalByUnreach);
        } else {
            timer = setTimeout(async () => {
                timer = null;
                await pingAll(taskList);
            }, adapter.config.interval);
        }
    }
}

function pingSingleDevice(task, retryCounter) {
    return new Promise(resolve =>
        ping.probe(task.host, {log: adapter.log.debug}, async (err, result) => {
            err && adapter.log.error(`Error by pinging: ${err}`);

            if (result) {
                adapter.log.debug(
                    `Ping result for ${result.host}: ${result.alive} in ${
                        result.ms === null ? '-' : result.ms
                    }ms (Tried ${retryCounter}/${adapter.config.numberOfRetries} times)`
                );

                if (!result.alive && retryCounter < adapter.config.numberOfRetries) {
                    /* When the ping failed, it also could be a device problem.
                       Some Android Handys sometimes don't answer to a ping,
                       but do in fact answer for the following ping.
                       So we are giving the device some more attempts until it finally fails.
                     */
                    resolve(false);
                    return;
                } else {
                    await setDeviceStates(task, result);
                }
            } else if (!err) {
                adapter.log.warn(`No result by pinging of ${task.host}`);
            }
            resolve(true);
        }));
}

async function setDeviceStates(task, result) {
    task.online = result.alive;
    if (task.extendedInfo) {
        await adapter.setStateAsync(task.stateAlive, {val: result.alive, ack: true});
        await adapter.setStateAsync(task.stateTime, {val: result.ms === null ? null : result.ms / 1000, ack: true});

        let rps = 0;
        if (result.alive && result.ms !== null && result.ms > 0) {
            rps = result.ms <= 1 ? 1000 : 1000.0 / result.ms;
        }
        await adapter.setStateAsync(task.stateRps, {val: rps, ack: true});
    } else {
        await adapter.setStateAsync(task.stateAlive, {val: result.alive, ack: true});
    }
}

function buildId(id) {
    return adapter.namespace +
        (id.device ? `.${id.device}` : '') +
        (id.channel ? `.${id.channel}` : '') +
        (id.state ? `.${id.state}` : '');
}

function isDevicesEqual(rhs, lhs) {
    return rhs.common.name === lhs.common.name;
}

function isChannelsEqual(rhs, lhs) {
    return rhs.common.name === lhs.common.name && rhs.native.host === lhs.native.host;
}

function isStatesEqual(rhs, lhs) {
    return rhs.common.name === lhs.common.name &&
        rhs.common.def === lhs.common.def &&
        rhs.common.min === lhs.common.min &&
        rhs.common.max === lhs.common.max &&
        rhs.common.type === lhs.common.type &&
        rhs.common.unit === lhs.common.unit &&
        rhs.common.read === lhs.common.read &&
        rhs.common.write === lhs.common.write &&
        rhs.common.role === lhs.common.role &&
        rhs.native.host === lhs.native.host;
}

async function syncObjects(preparedObjects, oldObjects) {
    if (preparedObjects.device) {
        const fullID = buildId(preparedObjects.device.id);
        const oldObj = oldObjects[fullID];

        if (oldObj && oldObj.type === 'device') {
            if (!isDevicesEqual(oldObj, preparedObjects.device)) {
                await adapter.extendObjectAsync(fullID, {
                    common: preparedObjects.device.common
                });
            }
            oldObjects[fullID] = undefined;
        } else {
            try {
                await adapter.setObjectAsync(fullID, {common: preparedObjects.device.common, type: 'device'});
            } catch (err) {
                adapter.log.error(`Cannot create device: ${fullID} Error: ${err}`);
            }
        }
    }

    for (let c = 0; c < preparedObjects.channels.length; c++) {
        const channel = preparedObjects.channels[c];
        const fullID = buildId(channel.id);
        const oldObj = oldObjects[fullID];

        if (oldObj && oldObj.type === 'channel') {
            if (!isChannelsEqual(oldObj, channel)) {
                adapter.log.debug(`Update channel id=${fullID}`);
                await adapter.extendObjectAsync(fullID, {
                    common: channel.common,
                    native: channel.native
                });
            }
            oldObjects[fullID] = undefined;
        } else {
            adapter.log.debug(`Create channel id=${fullID}`);

            try {
                await adapter.createChannelAsync(channel.id.device, channel.id.channel, channel.common, channel.native);
            } catch (err) {
                adapter.log.error(`Cannot create channel: ${fullID} Error: ${err}`);
            }
        }
    }

    for (let s = 0; s < preparedObjects.states.length; s++) {
        const state = preparedObjects.states[s];
        const fullID = buildId(state.id);
        const oldObj = oldObjects[fullID];

        if (oldObj && oldObj.type === 'state') {
            if (!isStatesEqual(oldObj, state)) {
                adapter.log.debug(`Update state id=${fullID}`);

                await adapter.extendObjectAsync(fullID, {
                    common: state.common,
                    native: state.native,
                });
            }
            oldObjects[fullID] = undefined;
        } else {
            adapter.log.debug(`Create state id=${fullID}`);

            try {
                await adapter.createStateAsync(state.id.device, state.id.channel, state.id.state, state.common, state.native);
            } catch (err) {
                adapter.log.error(`Cannot create state: ${fullID} Error: ${err}`);
            }
        }
    }

    const keys = Object.keys(oldObjects);
    for (let d = 0; d < keys.length; d++) {
        const id = keys[d];
        if (oldObjects[id]) {
            await adapter.delObjectAsync(id);
        }
    }
}

function prepareObjectsForHost(hostDevice, config) {
    const host = config.ip.trim();
    const name = config.name.trim();
    const idName = (config.use_name ? name || host : host).replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_');

    if (config.extended_info) {
        const channelID = {device: hostDevice, channel: idName};

        const stateAliveID = {device: hostDevice, channel: idName, state: 'alive'};
        const stateTimeID = {device: hostDevice, channel: idName, state: 'time'};
        const stateRpsID = {device: hostDevice, channel: idName, state: 'rps'};
        return {
            ping_task: {
                host,
                extendedInfo: true,
                stateAlive: stateAliveID,
                stateTime: stateTimeID,
                stateRps: stateRpsID,
            },
            channel: {
                id: channelID,
                common: {
                    name: name || host,
                    desc: `Ping of ${host}`,
                },
                native: {
                    host,
                }
            },
            states: [
                {
                    id: stateAliveID,
                    common: {
                        name: `Alive ${name}` || host,
                        def: false,
                        type: 'boolean',
                        read: true,
                        write: false,
                        role: 'indicator.reachable',
                        desc: `Ping state of ${host}`,
                    },
                    native: {
                        host,
                    }
                },
                {
                    id: stateTimeID,
                    common: {
                        name: `Time ${name || host}`,
                        def: 0,
                        type: 'number',
                        unit: 'sec',
                        read: true,
                        write: false,
                        role: 'value.interval',
                        desc: `Ping time to ${host}`,
                    },
                    native: {
                        host,
                    }
                },
                {
                    id: stateRpsID,
                    common: {
                        name: `RPS ${name || host}`,
                        def: 0,
                        min: 0,
                        max: 1000,
                        type: 'number',
                        unit: 'hz',
                        read: true,
                        write: false,
                        role: 'value',
                        desc: `Ping round trips per second to ${host}`,
                    },
                    native: {
                        host,
                    },
                },
            ],
        };
    } else {
        const stateID = {device: hostDevice, channel: '', state: idName};
        return {
            ping_task: {
                host: config.ip.trim(),
                extendedInfo: false,
                stateAlive: stateID
            },
            states: [
                {
                    id: stateID,
                    common: {
                        name: `Alive ${name}` || host,
                        def: false,
                        type: 'boolean',
                        read: true,
                        write: false,
                        role: 'indicator.reachable',
                        desc: `Ping state of ${host}`,
                    },
                    native: {
                        host,
                    },
                },
            ],
        };
    }
}

function prepareObjectsByConfig() {
    const result = {};
    const hostDeviceName = adapter.host;
    let hostDevice = '';

    adapter.log.debug(`Host=${hostDeviceName || ' no host name'}`);

    if (!adapter.config.noHostname) {
        hostDevice = hostDeviceName ? hostDeviceName.replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_') : '';
        result.device = {
            id: {
                device: hostDevice,
            },
            common: {
                name: hostDeviceName,
            },
        };
    }

    const pingTaskList = [];
    const channels = [];
    let states = [];
    const usedIDs = {};

    adapter.config.devices.forEach(device => {
        if (device.enabled === false) {
            return;
        }

        const config = prepareObjectsForHost(hostDevice, device);

        if (config.channel) {
            const fullID = buildId(config.channel.id);
            if (usedIDs[fullID]) {
                adapter.log.warn(
                    `Objects with same id = ${fullID} created for two hosts ${JSON.stringify(usedIDs[fullID])}  ${JSON.stringify(device)}`
                );
            } else {
                usedIDs[fullID] = device;
            }
            channels.push(config.channel);
        }

        config.states.forEach(state => {
            const fullID = buildId(state.id);
            if (usedIDs[fullID]) {
                adapter.log.warn(
                    `Objects with same id = ${fullID} created for two hosts ${JSON.stringify(usedIDs[fullID])}  ${JSON.stringify(device)}`
                );
            } else {
                usedIDs[fullID] = device;
            }
        });

        states = states.concat(config.states);
        pingTaskList.push(config.ping_task);
    });

    result.pingTaskList = pingTaskList;
    result.channels = channels;
    result.states = states;
    return result;
}

async function syncConfig() {
    adapter.log.debug('Prepare objects');
    const preparedObjects = prepareObjectsByConfig();
    adapter.log.debug('Get existing objects');

    const objects = await adapter.getAdapterObjectsAsync();
    adapter.log.debug('Prepare tasks of objects update');
    await syncObjects(preparedObjects, objects);

    adapter.log.debug('Start tasks of objects update');
    return preparedObjects.pingTaskList;
}

async function main(adapter) {
    await adapter.setStateAsync('browse.running', false, true);
    await adapter.setStateAsync('browse.progress', 0, true);
    await adapter.setStateAsync('browse.status', '', true);

    await adapter.subscribeStates('browse.running');

    if (!adapter.config.devices || !adapter.config.devices.length) {
        adapter.log.warn('No one host configured for ping');
        return;
    }

    adapter.config.interval = parseInt(adapter.config.interval, 10);

    if (adapter.config.interval < 5000) {
        adapter.log.warn('Poll interval is too short. Reset to 5000 ms.');
        adapter.config.interval = 5000;
    }
    if (!adapter.config.intervalByUnreach) {
        adapter.config.intervalByUnreach = adapter.config.interval;
    }

    adapter.config.intervalByUnreach = parseInt(adapter.config.intervalByUnreach, 10);
    if (adapter.config.intervalByUnreach < 5000) {
        adapter.log.warn('Offline poll interval is too short. Reset to 5000 ms.');
        adapter.config.intervalByUnreach = 5000;
    }

    adapter.config.numberOfRetries = parseInt(adapter.config.numberOfRetries, 10) || 1;

    if (adapter.config.numberOfRetries < 1) {
        adapter.log.warn('Number of retries is to low. Reset to 1.');
        adapter.config.numberOfRetries = 1;
    }

    if (adapter.config.setcap) {
        try {
            await allowPing();
        } catch (e) {
            adapter.log.warn(`Cannot allow setcap for ping: ${e}`);
        }
    }

    const pingTaskList = await syncConfig();
    await pingAll(pingTaskList);
    await pingAll(pingTaskList, true);
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
