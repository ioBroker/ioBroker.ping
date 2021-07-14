/**
 *
 *      ioBroker PING Adapter
 *
 *      (c) 2014-2020 bluefox<dogafox@gmail.com>
 *
 *      MIT License
 *
 */
/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */

'use strict';
const utils       = require('@iobroker/adapter-core'); // Get common adapter utils
const ping        = require('./lib/ping');
const adapterName = require('./package.json').name.split('.').pop();
let adapter;

let timer      = null;
let stopTimer  = null;
let isStopping = false;

const FORBIDDEN_CHARS = /[\]\[*,;'"`<>\\?]/g;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {name: adapterName});

    adapter = new utils.Adapter(options);

    adapter.on('message', obj => obj && processMessage(obj));

    adapter.on('ready', () => main(adapter));

    adapter.on('unload', () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (stopTimer) {
            clearTimeout(stopTimer);
            stopTimer = null;
        }
        isStopping = true;
    });
    return adapter;
}

function processMessage(obj) {
    if (!obj || !obj.command) {
        return;
    }

    switch (obj.command) {
        case 'ping': {
            // Try to ping one IP or name
            if (obj.callback && obj.message) {
                ping.probe(obj.message, {log: adapter.log.debug}, (err, result) =>
                    adapter.sendTo(obj.from, obj.command, {result}, obj.callback));
            }
            break;
        }
    }
}

// Terminate adapter after 30 seconds idle
function stop() {
    stopTimer && clearTimeout(stopTimer);
    stopTimer = null;

    // Stop only if schedule mode
    if (adapter.common && adapter.common.mode === 'schedule') {
        stopTimer = setTimeout(() => {
            stopTimer = null;
            timer &&  clearTimeout(timer);
            timer = null;
            isStopping = true;
            adapter.stop();
        }, 30000);
    }
}

function pingAll(taskList, index) {
    stopTimer && clearTimeout(stopTimer);
    stopTimer = null;

    if (index >= taskList.length) {
        timer = setTimeout(() => pingAll(taskList, 0), adapter.config.interval);
        return;
    }

    const task = taskList[index];
    index++;
    adapter.log.debug('Pinging ' + task.host);

    ping.probe(task.host, {log: adapter.log.debug}, (err, result) => {
        err && adapter.log.error(err);

        if (result) {
            adapter.log.debug('Ping result for ' + result.host + ': ' + result.alive + ' in ' + (result.ms === null ? '-' : result.ms) + 'ms');

            if (task.extendedInfo) {
                adapter.setState(task.stateAlive, {val: result.alive, ack: true});
                adapter.setState(task.stateTime, {val: result.ms === null ? null : result.ms / 1000, ack: true});

                let rps = 0;
                if (result.alive && result.ms !== null && result.ms > 0) {
                    rps = result.ms <= 1 ? 1000 : 1000.0 / result.ms;
                }
                adapter.setState(task.stateRps, { val: rps, ack: true });
            } else {
                adapter.setState(task.stateAlive, { val: result.alive, ack: true });
            }
        }

        !isStopping && setImmediate(() => pingAll(taskList, index));
    });
}

function buildId(id) {
    return adapter.namespace + (id.device ? '.' + id.device : '') + (id.channel ? '.' + id.channel : '') + (id.state ? '.' + id.state : '');
}

function processTasks(tasks, callback) {
    if (!tasks || !tasks.length) {
        callback && callback();
    } else {
        const task = tasks.shift();
        adapter.log.debug('Task' + JSON.stringify(task));

        if (task.type === 'create_device') {
            adapter.log.debug('Create device id=' + buildId(task.id));
            try {
                adapter.createDevice(task.id.device, task.data.common, task.data.native, (err, obj) => {
                    err && adapter.log.error('Cannot create device: ' + buildId(task.id) + ' Error: ' + err);

                    setImmediate(processTasks, tasks, callback);
                });
            } catch (err) {
                adapter.log.error('Cannot create device: ' + buildId(task.id) + ' Error: ' + err);

                setImmediate(processTasks, tasks, callback);
            }
        } else if (task.type === 'update_device') {
            adapter.log.debug('Update device id=' + buildId(task.id));
            adapter.extendObject(task.id, task.data, err => {
                err && adapter.log.error('Cannot update device: ' + buildId(task.id) + ' Error: ' + err);

                setImmediate(processTasks, tasks, callback);
            });
        } else if (task.type === 'delete_device') {
            adapter.log.debug('Delete device id=' + task.id);

            adapter.delObject(task.id, err => {
                if (err) {
                    adapter.log.error('Cannot delete device : ' + task.id + ' Error: ' + err);
                }
                setImmediate(processTasks, tasks, callback);
            });
        } else if (task.type === 'create_channel') {
            adapter.log.debug('Create channel id=' + buildId(task.id));

            try {
                adapter.createChannel(task.id.device, task.id.channel, task.data.common, task.data.native, err => {
                    err && adapter.log.error('Cannot create channel : ' + buildId(task.id) + ' Error: ' + err);

                    setImmediate(processTasks, tasks, callback);
                });
            } catch (err) {
                adapter.log.error('Cannot create channel : ' + buildId(task.id) + ' Error: ' + err);

                return setImmediate(processTasks, tasks, callback);
            }
        } else if (task.type === 'update_channel') {
            adapter.log.debug('Update channel id=' + buildId(task.id));

            adapter.extendObject(task.id, task.data, err => {
                err && adapter.log.error('Cannot update channel : ' + buildId(task.id) + ' Error: ' + err);

                setImmediate(processTasks, tasks, callback);
            });
        } else if (task.type === 'delete_channel') {
            adapter.log.debug('Delete channel id=' + task.id);

            adapter.delObject(task.id, err => {
                err && adapter.log.error('Cannot delete channel : ' + task.id + ' Error: ' + err);

                setImmediate(processTasks, tasks, callback);
            });
        } else if (task.type === 'create_state') {
            adapter.log.debug('Create state id=' + buildId(task.id));

            try {
                adapter.createState(task.id.device, task.id.channel, task.id.state, task.data.common, task.data.native, err => {
                    err && adapter.log.error('Cannot create state : ' + buildId(task.id) + ' Error: ' + err);

                    setImmediate(processTasks, tasks, callback);
                });
            } catch (err) {
                adapter.log.error('Cannot create state : ' + buildId(task.id) + ' Error: ' + err);

                return setImmediate(processTasks, tasks, callback);
            }
        } else if (task.type === 'update_state') {
            adapter.log.debug('Update state id=' + buildId(task.id));

            adapter.extendObject(task.id, task.data, err => {
                err && adapter.log.error('Cannot update state : ' + buildId(task.id) + ' Error: ' + err);

                setImmediate(processTasks, tasks, callback);
            });
        } else if (task.type === 'delete_state') {
            adapter.log.debug('Delete state id=' + task.id);

            adapter.delObject(task.id, err => {
                err && adapter.log.error('Cannot delete state : ' + buildId(task.id) + ' Error: ' + err);

                setImmediate(processTasks, tasks, callback);
            });
        } else {
            adapter.log.error('Unknown task type: ' + JSON.stringify(task));

            setImmediate(processTasks, tasks, callback);
        }
    }
}

function isDevicesEqual(rhs, lhs) {
    return rhs.common.name === lhs.common.name;
}

function isChannelsEqual(rhs, lhs) {
    return rhs.common.name === lhs.common.name &&
           rhs.native.host === lhs.native.host;
}

function isStatesEqual(rhs, lhs) {
    return (rhs.common.name  === lhs.common.name)
        && (rhs.common.def   === lhs.common.def)
        && (rhs.common.min   === lhs.common.min)
        && (rhs.common.max   === lhs.common.max)
        && (rhs.common.type  === lhs.common.type)
        && (rhs.common.unit  === lhs.common.unit)
        && (rhs.common.read  === lhs.common.read)
        && (rhs.common.write === lhs.common.write)
        && (rhs.common.role  === lhs.common.role)
        && (rhs.native.host  === lhs.native.host);
}

function prepareTasks(preparedObjects, old_objects) {
    const devicesToUpdate  = [];
    const channelsToUpdate = [];
    const statesToUpdate   = [];

    if (preparedObjects.device) {
        const fullID = buildId(preparedObjects.device.id);
        const oldObj = old_objects[fullID];

        if (oldObj && oldObj.type === 'device') {
            if (!isDevicesEqual(oldObj, preparedObjects.device)) {
                devicesToUpdate.push({
                    type: 'update_device',
                    id: preparedObjects.device.id,
                    data: {
                        common: preparedObjects.device.common
                    }
                });
            }
            old_objects[fullID] = undefined;
        } else {
            devicesToUpdate.push({
                type: 'create_device',
                id: preparedObjects.device.id,
                data: {
                    common: preparedObjects.device.common
                }
            });
        }
    }

    preparedObjects.channels.forEach(channel => {
        const fullID = buildId(channel.id);
        const oldObj = old_objects[fullID];

        if (oldObj && oldObj.type === 'channel') {
            if (!isChannelsEqual(oldObj, channel)) {
                channelsToUpdate.push({
                    type: 'update_channel',
                    id: channel.id,
                    data: {
                        common: channel.common,
                        native: channel.native
                    }
                });
            }
            old_objects[fullID] = undefined;
        } else {
            channelsToUpdate.push({
                type: 'create_channel',
                id: channel.id,
                data: {
                    common: channel.common,
                    native: channel.native
                }
            });
        }
    });

    preparedObjects.states.forEach(state => {
        const fullID = buildId(state.id);
        const oldObj = old_objects[fullID];

        if (oldObj && oldObj.type === 'state') {
            if (!isStatesEqual(oldObj, state)) {
                statesToUpdate.push({
                    type: 'update_state',
                    id: state.id,
                    data: {
                        common: state.common,
                        native: state.native
                    }
                });
            }
            old_objects[fullID] = undefined;
        } else {
            statesToUpdate.push({
                type: 'create_state',
                id: state.id,
                data: {
                    common: state.common,
                    native: state.native
                }
            });
        }
    });

    const oldEntries       = Object.keys(old_objects).map(id => ([id, old_objects[id]])).filter(([id, object]) => object);

    const devicesToDelete  = oldEntries.filter(([id, object]) => object.type === 'device').map(([id, object]) => ({ type: 'delete_device', id: id }));
    const channelsToDelete = oldEntries.filter(([id, object]) => object.type === 'channel').map(([id, object]) => ({ type: 'delete_channel', id: id }));
    const stateToDelete    = oldEntries.filter(([id, object]) => object.type === 'state').map(([id, object]) => ({ type: 'delete_state', id: id }));

    return stateToDelete.concat(channelsToDelete, devicesToDelete, devicesToUpdate, channelsToUpdate, statesToUpdate);
}

function prepareObjectsForHost(hostDevice, config) {
    const host = config.ip;
    const name = config.name;
    const idName = (config.use_name ? (name || host) : host).replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_');

    if (config.extended_info) {
        const channelID = {device: hostDevice, channel: idName};

        const stateAliveID = {device: hostDevice, channel: idName, state: 'alive'};
        const stateTimeID  = {device: hostDevice, channel: idName, state: 'time'};
        const stateRpsID   = {device: hostDevice, channel: idName, state: 'rps'};
        return {
            ping_task: {
                host: config.ip,
                extendedInfo: true,
                stateAlive: stateAliveID,
                stateTime: stateTimeID,
                stateRps: stateRpsID
            },
            channel: {
                id: channelID,
                common: {
                    name: name || host,
                    desc: 'Ping of ' + host
                },
                native: {
                    host: host
                }
            },
            states: [
                {
                    id: stateAliveID,
                    common: {
                        name: 'Alive ' + name || host,
                        def: false,
                        type: 'boolean',
                        read: true,
                        write: false,
                        role: 'indicator.reachable',
                        desc: 'Ping state of ' + host
                    },
                    native: {
                        host: host
                    }
                },
                {
                    id: stateTimeID,
                    common: {
                        name: 'Time ' + (name || host),
                        def: 0,
                        type: 'number',
                        unit: 'sec',
                        read: true,
                        write: false,
                        role: 'value.interval',
                        desc: 'Ping time to ' + host
                    },
                    native: {
                        host: host
                    }
                },
                {
                    id: stateRpsID,
                    common: {
                        name: 'RPS ' + (name || host),
                        def: 0,
                        min: 0,
                        max: 1000,
                        type: 'number',
                        unit: 'hz',
                        read: true,
                        write: false,
                        role: 'value',
                        desc: 'Ping round trips per second to ' + host
                    },
                    native: {
                        host: host
                    }
                }
            ]
        };
    } else {
        const stateID = {device: hostDevice, channel: '', state: idName};
        return {
            ping_task: {
                host: config.ip,
                extendedInfo: false,
                stateAlive: stateID,
            },
            states: [
                {
                    id: stateID,
                    common: {
                        name: 'Alive ' + name || host,
                        def: false,
                        type: 'boolean',
                        read: true,
                        write: false,
                        role: 'indicator.reachable',
                        desc: 'Ping state of ' + host
                    },
                    native: {
                        host: host
                    }
                }
            ]
        };
    }
}

function prepareObjectsByConfig() {
    const result = {};
    const hostDeviceName = adapter.host;
    let hostDevice = '';

    adapter.log.debug('Host=' + (hostDeviceName || ' no host name'));

    if (!adapter.config.noHostname) {
        hostDevice = hostDeviceName ? hostDeviceName.replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_') : '';
        result.device = {
            id: {
                device: hostDevice
            },
            common: {
                name: hostDeviceName
            }
        };
    }

    const pingTaskList = [];
    const channels = [];
    let   states = [];
    const usedIDs = {};

    adapter.config.devices.forEach(device => {
        if (device.enabled === false) {
            return;
        }

        const config = prepareObjectsForHost(hostDevice, device);

        if (config.channel) {
            const fullID = buildId(config.channel.id);
            if (usedIDs[fullID]) {
                adapter.log.warn('Objects with same id = ' + fullID + ' created for two hosts ' + JSON.stringify(usedIDs[fullID]) + '  ' + JSON.stringify(device));
            } else {
                usedIDs[fullID] = device;
            }
            channels.push(config.channel);
        }

        config.states.forEach(state => {
            const fullID = buildId(state.id);
            if (usedIDs[fullID]) {
                adapter.log.warn('Objects with same id = ' + fullID + ' created for two hosts ' + JSON.stringify(usedIDs[fullID]) + '  ' + JSON.stringify(device));
            } else {
                usedIDs[fullID] = device;
            }
        });

        states = states.concat(config.states);
        pingTaskList.push(config.ping_task);
    });

    result.pingTaskList = pingTaskList;
    result.channels     = channels;
    result.states       = states;
    return result;
}

function syncConfig(callback) {
    adapter.log.debug('Prepare objects');
    const preparedObjects = prepareObjectsByConfig();
    adapter.log.debug('Get existing objects');

    adapter.getAdapterObjects(_objects => {
        adapter.log.debug('Prepare tasks of objects update');
        const tasks = prepareTasks(preparedObjects, _objects);

        adapter.log.debug('Start tasks of objects update');
        processTasks(tasks,  () => {
            adapter.log.debug('Finished tasks of objects update');
            callback(preparedObjects.pingTaskList);
        });
    });
}

function main(adapter) {
    if (!adapter.config.devices || !adapter.config.devices.length) {
        adapter.log.warn('No one host configured for ping');
        return stop();
    }

    adapter.config.interval = parseInt(adapter.config.interval, 10);

    if (adapter.config.interval < 5000) {
        adapter.log.warn('Poll interval is too short. Reset to 5000 ms.');
        adapter.config.interval = 5000;
    }

    syncConfig(pingTaskList =>
        pingAll(pingTaskList, 0));
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
