/**
 *
 *      ioBroker PING Adapter
 *
 *      (c) 2014-2017 bluefox<dogafox@gmail.com>
 *
 *      MIT License
 *
 */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';
var utils      = require(__dirname + '/lib/utils'); // Get common adapter utils
var ping       = require(__dirname + '/lib/ping');
var adapter    = utils.Adapter('ping');

var timer      = null;
var stopTimer  = null;
var isStopping = false;

const FORBIDDEN_CHARS = /[\]\[*,;'"`<>\\?]/g;

adapter.on('message', function (obj) {
    if (obj) processMessage(obj);
    processMessages();
});

adapter.on('ready', function () {
    main();
});

adapter.on('unload', function () {
    if (timer) {
        clearInterval(timer);
        timer = 0;
    }
    isStopping = true;
});

function processMessage(obj) {
    if (!obj || !obj.command) return;
    switch (obj.command) {
        case 'ping': {
            // Try to connect to mqtt broker
            if (obj.callback && obj.message) {
                ping.probe(obj.message, {log: adapter.log.debug}, function (err, result) {
                    adapter.sendTo(obj.from, obj.command, res, obj.callback);
                });
            }
            break;
        }
    }
}

function processMessages() {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            processMessage(obj.command, obj.message);
            processMessages();
        }
    });
}

// Terminate adapter after 30 seconds idle
function stop() {
    if (stopTimer) clearTimeout(stopTimer);

    // Stop only if schedule mode
    if (adapter.common && adapter.common.mode === 'schedule') {
        stopTimer = setTimeout(function () {
            stopTimer = null;
            if (timer) clearInterval(timer);
            isStopping = true;
            adapter.stop();
        }, 30000);
    }
}

function pingAll(taskList, index) {
    if (stopTimer) clearTimeout(stopTimer);

    if (index >= taskList.length) {
        timer = setTimeout(function () {
            pingAll(taskList, 0);
        }, adapter.config.interval);
        return;
    }

    var task = taskList[index];
    index++;
    adapter.log.debug('Pinging ' + task.host);

    ping.probe(task.host, {log: adapter.log.debug}, function (err, result) {
        if (err) adapter.log.error(err);
        if (result) {
            adapter.log.debug('Ping result for ' + result.host + ': ' + result.alive + ' in ' + (result.ms === null ? '-' : result.ms) + 'ms');
            if (task.extended_info) {
                adapter.setState(task.state_alive, { val: result.alive, ack: true });
                adapter.setState(task.state_time, { val: result.ms === null ? '-' : result.ms / 1000, ack: true });
                var rps = 0;
                if (result.alive) {
                    if (!(result.ms === null)) {
                        if (result.ms > 0) {
                            rps = result.ms <= 1 ? 1000 : 1000.0 / result.ms;
                        }
                    }
                }
                adapter.setState(task.state_rps, { val: rps, ack: true });
            } else {
                adapter.setState(task.state_alive, { val: result.alive, ack: true });
            }
        }
        if (!isStopping) {
            setTimeout(function () {
                pingAll(taskList, index);
            }, 0);
        }
    });
}

function buildId(id) {
    let result = adapter.namespace + (id.device ? '.' + id.device : '') + (id.channel ? '.' + id.channel : '') + (id.state ? '.' + id.state : '');
    return result;
}

function processTasks(tasks, callback) {
    if (!tasks || !tasks.length) {
        callback && callback();
    } else {
        var task = tasks.shift();
        adapter.log.debug('Task' + JSON.stringify(task));

        // Workaround because of this fixed bug: https://github.com/ioBroker/ioBroker.js-controller/commit/d8d7cf2f34f24e0723a18a1cbd3f8ea23037692d
        var timeout = setTimeout(function () {
            adapter.log.warn('please update js-controller to at least 1.2.0');
            timeout = null;
            processTasks(tasks, callback);
        }, 1000);

        if (task.type === 'create_device') {
            adapter.log.debug('Create device id=' + buildId(task.id));
            adapter.createDevice(task.id.device, task.data.common, task.data.native, function (err, obj) {
                if (err) {
                    adapter.log.error('Cannot create device: ' + buildId(task.id) + ' Error: ' + err);
                }

                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'update_device') {
            adapter.log.debug('Update device id=' + buildId(task.id));
            adapter.extendObject(task.id, task.data, function (err) {
                if (err) {
                    adapter.log.error('Cannot update device : ' + buildId(task.id) + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'delete_device') {
            adapter.log.debug('Delete device id=' + task.id);
            adapter.delObject(task.id, function (err) {
                if (err) {
                    adapter.log.error('Cannot delete device : ' + task.id + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'create_channel') {
            adapter.log.debug('Create channel id=' + buildId(task.id));
            adapter.createChannel(task.id.device, task.id.channel, task.data.common, task.data.native, function (err) {
                if (err) {
                    adapter.log.error('Cannot create channel : ' + buildId(task.id) + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'update_channel') {
            adapter.log.debug('Update channel id=' + buildId(task.id));
            adapter.extendObject(task.id, task.data, function (err) {
                if (err) {
                    adapter.log.error('Cannot update channel : ' + buildId(task.id) + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'delete_channel') {
            adapter.log.debug('Delete channel id=' + task.id);
            adapter.delObject(task.id, function (err) {
                if (err) {
                    adapter.log.error('Cannot delete channel : ' + task.id + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'create_state') {
            adapter.log.debug('Create state id=' + buildId(task.id));
            adapter.createState(task.id.device, task.id.channel, task.id.state, task.data.common, task.data.native, function (err) {
                if (err) {
                    adapter.log.error('Cannot create state : ' + buildId(task.id) + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'update_state') {
            adapter.log.debug('Update state id=' + buildId(task.id));
            adapter.extendObject(task.id, task.data, function (err) {
                if (err) {
                    adapter.log.error('Cannot update state : ' + buildId(task.id) + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'delete_state') {
            adapter.log.debug('Delete state id=' + task.id);
            adapter.delObject(task.id, function (err) {
                if (err) {
                    adapter.log.error('Cannot delete state : ' + task.id  + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else {
            adapter.log.error('Unknown task type: ' + JSON.stringify(task));
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
                setImmediate(processTasks, tasks, callback);
            }
        }
    }
}

function isDevicesEqual(rhs, lhs) {
    return (rhs.common.name === lhs.common.name);
}

function isChannelsEqual(rhs, lhs) {
    return (rhs.common.name === lhs.common.name)
        && (rhs.native.host === lhs.native.host);
}

function isStatesEqual(rhs, lhs) {
    return (rhs.common.name === lhs.common.name)
        && (rhs.common.def === lhs.common.def)
        && (rhs.common.min === lhs.common.min)
        && (rhs.common.max === lhs.common.max)
        && (rhs.common.type === lhs.common.type)
        && (rhs.common.unit === lhs.common.unit)
        && (rhs.common.read === lhs.common.read)
        && (rhs.common.write === lhs.common.write)
        && (rhs.common.role === lhs.common.role)
        && (rhs.native.host === lhs.native.host);
}

function prepare_tasks(prepared_objects, old_objects) {
    var devices_to_update = [];
    var channels_to_update = [];
    var states_to_update = [];

    if (prepared_objects.device) {
        const id_full = buildId(prepared_objects.device.id);
        var old_obj = old_objects[id_full];
        if (old_obj && old_obj.type === 'device') {
            if (!isDevicesEqual(old_obj, prepared_objects.device)) {
                devices_to_update.push({
                    type: 'update_device',
                    id: prepared_objects.device.id,
                    data: {
                        common: prepared_objects.device.common
                    }
                });
            }
            old_objects[id_full] = undefined;
        } else {
            devices_to_update.push({
                type: 'create_device',
                id: prepared_objects.device.id,
                data: {
                    common: prepared_objects.device.common
                }
            });
        }
    }

    prepared_objects.channels.forEach(function (channel) {
        const id_full = buildId(channel.id);
        var old_obj = old_objects[id_full];
        if (old_obj && old_obj.type === 'channel') {
            if (!isChannelsEqual(old_obj, channel)) {
                channels_to_update.push({
                    type: 'update_channel',
                    id: channel.id,
                    data: {
                        common: channel.common,
                        native: channel.native
                    }
                });
            }
            old_objects[id_full] = undefined;
        } else {
            channels_to_update.push({
                type: 'create_channel',
                id: channel.id,
                data: {
                    common: channel.common,
                    native: channel.native
                }
            });
        }

    })

    prepared_objects.states.forEach(function (state) {
        const id_full = buildId(state.id);
        var old_obj = old_objects[id_full];
        if (old_obj && old_obj.type === 'state') {
            if (!isStatesEqual(old_obj, state)) {
                states_to_update.push({
                    type: 'update_state',
                    id: state.id,
                    data: {
                        common: state.common,
                        native: state.native
                    }
                });
            }
            old_objects[id_full] = undefined;
        } else {
            states_to_update.push({
                type: 'create_state',
                id: state.id,
                data: {
                    common: state.common,
                    native: state.native
                }
            });
        }

    })

    var old_entries = Object.keys(old_objects).map(id => ([id, old_objects[id]])).filter(([id, object]) => object);

    var devices_to_delete = old_entries.filter(([id, object]) => object.type === 'device').map(([id, object]) => ({ type: 'delete_device', id: id }));
    var channels_to_delete = old_entries.filter(([id, object]) => object.type === 'channel').map(([id, object]) => ({ type: 'delete_channel', id: id }));
    var states_to_delete = old_entries.filter(([id, object]) => object.type === 'state').map(([id, object]) => ({ type: 'delete_state', id: id }));

    var tasks = states_to_delete.concat(channels_to_delete, devices_to_delete, devices_to_update, channels_to_update, states_to_update);
    return tasks;
}

function prepare_objects_for_host(hostDevice, config) {
    var host = config.ip;
    var name = config.name;
    var id_name = (config.use_name ? (name || host) : host).replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_');

    if (config.extended_info) {
        var channel_id = { device: hostDevice, channel: id_name };

        var state_alive_id = { device: hostDevice, channel: id_name, state: 'alive' };
        var state_time_id = { device: hostDevice, channel: id_name, state: 'time' };
        var state_rps_id = { device: hostDevice, channel: id_name, state: 'rps' };
        return {
            ping_task: {
                host: config.ip,
                extended_info: true,
                state_alive: state_alive_id,
                state_time: state_time_id,
                state_rps: state_rps_id
            },
            channel: {
                id: channel_id,
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
                    id: state_alive_id,
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
                    id: state_time_id,
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
                    id: state_rps_id,
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
        var state_id = { device: hostDevice, channel: '', state: id_name };
        return {
            ping_task: {
                host: config.ip,
                extended_info: false,
                state_alive: state_id,
            },
            states: [
                {
                    id: state_id,
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
    };
}

function prepare_objects_by_config() {
    var result = {};
    var hostDeviceName = adapter.host;
    var hostDevice = '';
    adapter.log.debug('Host=' + (hostDeviceName || ' no host name'));


    if (!adapter.config.noHostname) {
        hostDevice = hostDeviceName ? hostDeviceName.replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_') : '';
        result.device = {
            id: { device: hostDevice },
            common: {
                name: hostDeviceName
            }
        };
    }
    var pingTaskList = [];
    var channels = [];
    var states = [];
    var used_ids = {};

    for (var k = 0; k < adapter.config.devices.length; k++) {
        var device = adapter.config.devices[k];
        var config = prepare_objects_for_host(hostDevice, device);
        if (config.channel) {
            var id_full = buildId(config.channel.id);
            if (used_ids[id_full]) {
                adapter.log.warn('Objects with same id = ' + id_full + ' created for two hosts ' + JSON.stringify(used_ids[id_full]) + '  ' + JSON.stringify(device));
            } else {
                used_ids[id_full] = device;
            }
            channels.push(config.channel);
        }
        config.states.forEach(state => {
            var id_full = buildId(state.id);
            if (used_ids[id_full]) {
                adapter.log.warn('Objects with same id = ' + id_full + ' created for two hosts ' + JSON.stringify(used_ids[id_full]) + '  ' + JSON.stringify(device));
            } else {
                used_ids[id_full] = device;
            }
        });

        states = states.concat(config.states);
        pingTaskList.push(config.ping_task);
    }

    result.pingTaskList = pingTaskList;
    result.channels = channels;
    result.states = states;
    return result;
}

function syncConfig(callback) {
    adapter.log.debug('Prepare objects');
    var prepared_objects = prepare_objects_by_config();
    adapter.log.debug('Get existing objects');
    adapter.getAdapterObjects(function (_objects) {
        adapter.log.debug('Prepare tasks of objects update');
        var tasks = prepare_tasks(prepared_objects, _objects);

        adapter.log.debug('Start tasks of objects update');
        processTasks(tasks, function () {
            adapter.log.debug('Finished tasks of objects update');
            callback(prepared_objects.pingTaskList);
        });
    });
}

function main() {
    if (!adapter.config.devices.length) {
        adapter.log.warn('No one host configured for ping');
        stop();
        return;
    }

    adapter.config.interval = parseInt(adapter.config.interval, 10);

    if (adapter.config.interval < 5000) {
        adapter.log.warn('Poll interval is too short. Reset to 5000 ms.');
        adapter.config.interval = 5000;
    }

    syncConfig(function (pingTaskList) {
        pingAll(pingTaskList, 0);
    });
}
