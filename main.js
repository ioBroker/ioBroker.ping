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

var hostDeviceName = ''; // Device name for states
var hostDevice = ''; // Device id for states

function getChannelDCForHost(host) {
    return {device: hostDevice, channel: host.replace(/[.\s]+/g, '_')};
}

function channelDCtoStateDCS(DC) {
    return { device: DC.device, channel: '', state: DC.channel};
}

function getStateReachableDCSForHost(host) {
    var result = getChannelDCForHost(host);
    result.state = 'alive';
    return result;
}

function getStateTimeDCSForHost(host) {
    var result = getChannelDCForHost(host);
    result.state = 'time';
    return result;
}

function getStateRpsDCSForHost(host) {
    var result = getChannelDCForHost(host);
    result.state = 'rps';
    return result;
}

function pingAll(hosts) {
    if (stopTimer) clearTimeout(stopTimer);

    if (!hosts) {
        hosts = [];
        for (var i = 0; i < adapter.config.devices.length; i++) {
            hosts.push(adapter.config.devices[i].ip);
        }
    }
    if (!hosts.length) {
        timer = setTimeout(function () {
            pingAll();
        }, adapter.config.interval);
        return;
    }

    var host = hosts.pop();
    adapter.log.debug('Pinging ' + host);

    ping.probe(host, {log: adapter.log.debug}, function (err, result) {
        if (err) adapter.log.error(err);
        if (result) {
            adapter.log.debug('Ping result for ' + result.host + ': ' + result.alive + ' in ' + (result.ms === null ? '-' : result.ms) + 'ms');
            adapter.setState(channelDCtoStateDCS(getChannelDCForHost(result.host)), {val: result.alive, ack: true}); // Added for backward compatible
            adapter.setState(getStateReachableDCSForHost(result.host), {val: result.alive, ack: true});
            adapter.setState(getStateTimeDCSForHost(result.host), {val: result.ms === null ? '-' : result.ms / 1000, ack: true});
            var rps = 0;
            if (result.alive) {
                if (!(result.ms === null)) {
                   if (result.ms > 0) {
                      rps = result.ms <= 1 ? 1000 : 1000 / result.ms;
                   }
                }
            }
            adapter.setState(getStateRpsDCSForHost(result.host), {val: rps,    ack: true});
        }
        if (!isStopping) {
            setTimeout(function () {
                pingAll(hosts);
            }, 0);
        }
    });
}

function getChannelIdFromFullId(id) {
    var DCS = adapter.idToDCS(id)
    var channel = DCS.channel;
    if (!channel) {
        channel = DCS.device;
    }
    return channel;
}

function getStateIdFromFullId(id) {
    var DCS = adapter.idToDCS(id)
    var state = DCS.state;
    if (!state) {
        state = DCS.channel;
        if (!state) {
            state = DCS.device;
        }
    }
    return state;
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

        if (task.type === 'extendObject') {
            adapter.extendObject(task.id, task.data, function ( err ) {
                if (err) {
                    adapter.log.error('Cannot update object: ' + task.id + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'deleteChannel') {
            adapter.deleteChannel(task.device, task.channel, function ( err ) {
                if (err) {
                    adapter.log.error('Cannot delete channel : ' + task.device + '.' + task.channel + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'createChannel') {
            var channel = task.channelInfo.channel;
            adapter.createChannel(channel.id.device, channel.id.channel, channel.common, channel.native, function ( err ) {
                if (err) {
                    adapter.log.error('Cannot create channel: ' + JSON.stringify(task.channelInfo) + ' Error: ' + err);
                } else {
                    for(var i = 0; i < task.channelInfo.states.length; i++) {
                        tasks.push({
                            type: 'createState',
                            stateInfo: task.channelInfo.states[i]
                        });
                    }
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });

        } else if (task.type === 'updateStatesOfChannel') {
            adapter.getStatesOf(task.channelInfo.channel.id.device, task.channelInfo.channel.id.channel, function (err, _states) {
                if (err) {
                    adapter.log.error('Cannot read states for channel: ' + JSON.stringify(task.channelInfo) + ' Error: ' + err);
                }
                var states = task.channelInfo.states;
                if (_states) {
                    for (var j = 0; j < _states.length; j++) {
                        var state = getStateIdFromFullId(_states[j]._id);
                        var host = _states[j].native.host;
                        if (!host) {
                            adapter.log.warn('No host address found for ' + JSON.stringify(_states[j]));
                            continue;
                        }

                        var pos = -1;
                        for (var k = 0; k < states.length; k++) {
                            if ((states[k].id.state === state)) {
                                pos = k;
                                break;
                            }
                        }
                        if (pos === -1) {
                            tasks.push({
                                type: 'deleteState',
                                device: task.channelInfo.channel.id.device,
                                channel: task.channelInfo.channel.id.channel,
                                state: state
                            });
                            continue;
                        }

                        if (JSON.stringify(_states[j].common) !== JSON.stringify(states[pos].common))  {
                            tasks.push({
                                type: 'extendObject',
                                id:   _states[j]._id,
                                data: {common: states[pos].common}
                            });
                        }
                        states.splice(pos, 1);
                    }
                }

                if (states.length) {
                    for (var r = 0; r < states.length; r++) {
                        tasks.push({
                            type: 'createState',
                            stateInfo: states[r]
                        });
                    }
                }

                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'createState') {
            adapter.createState(task.stateInfo.id.device, task.stateInfo.id.channel, task.stateInfo.id.state, task.stateInfo.common, task.stateInfo.native,  function (err) {
                if (err) {
                    adapter.log.error('Cannot create state: ' + JSON.stringify(task.stateInfo) + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else if (task.type === 'deleteState') {
            adapter.deleteState(task.device, task.channel, task.state, function ( err ) {
                if (err) {
                    adapter.log.error('Cannot delete state : ' + task.device + '.' + task.channel + '.' + task.state + ' Error: ' + err);
                }
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    setImmediate(processTasks, tasks, callback);
                }
            });
        } else {
            adapter.log.error('Unknown task name: ' + JSON.stringify(task));
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
                setImmediate(processTasks, tasks, callback);
            }
        }
    }
}

function addOrUpdateDevice(device, callback) {
    if (device) {
        adapter.getObject(device, function (err, obj) {
            if (err || !obj) {
                // if root does not exist, channel will not be created
                adapter.createDevice(device, {name: hostDeviceName}, function (err, obj) {
                    if (err) {
                        adapter.log.error('Cannot create device: ' + device + ' Error: ' + err);
                    }
                    callback();
                });
            } else {
                callback();
            }
        });
    } else {
        callback();
    }
}

function prepareStatesForHost(name, host) {
    return {
        channel: {
            id: getChannelDCForHost(host),
            common: {
                name:   name || host,
                desc:   'Ping of ' + host
            },
            native: {
                host: host
            }
        },
        states: [
            {
                id: getStateReachableDCSForHost(host),
                common: {
                    name:   'Alive ' + name || host,
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  false,
                    role:   'indicator.reachable',
                    desc:   'Ping state of ' + host
                },
                native: {
                    host: host
                }
            },
            {
                id: getStateTimeDCSForHost(host),
                common: {
                    name:   'Time ' + (name || host),
                    def:    0,
                    type:   'number',
                    unit:   'sec',
                    read:   true,
                    write:  false,
                    role:   'value.interval',
                    desc:   'Ping time to ' + host
                },
                native: {
                    host: host
                }
            },
            {
                id: getStateRpsDCSForHost(host),
                common: {
                    name:   'RPS ' + (name || host),
                    def:    0,
                    min:    0,
                    max:    1000,
                    type:   'number',
                    unit:   'hz',
                    read:   true,
                    write:  false,
                    role:   'value',
                    desc:   'Ping round trips per second to ' + host
                },
                native: {
                    host: host
                }
            }
        ]
    };
}

function syncConfig(callback) {
    addOrUpdateDevice(hostDevice, function (){
        adapter.log.debug('Get channels for device ' + hostDevice);
        adapter.getChannelsOf(hostDevice, function (err, _channels) {
            if (err) {
                adapter.log.error('Cannot read channels for device: ' + hostDevice + ' Error: ' + err);
            }
            var configToAdd = [];
            if (adapter.config.devices) {
                for (var k = 0; k < adapter.config.devices.length; k++) {
                    configToAdd.push(prepareStatesForHost(adapter.config.devices[k].name, adapter.config.devices[k].ip));
                }
            }
            var tasks = [];

            if (_channels) {
                for (var j = 0; j < _channels.length; j++) {
                    var channel = getChannelIdFromFullId(_channels[j]._id);

                    var host = _channels[j].native.host;
                    if (!host) {
                        adapter.log.warn('No host address found for ' + JSON.stringify(_channels[j]));
                        continue;
                    }

                    var pos = -1;
                    for (var k = 0; k < configToAdd.length; k++) {
                        if ((configToAdd[k].channel.id.channel === channel)) {
                            pos = k;
                            break;
                        }
                    }
                    if (pos === -1) {
                        tasks.push({
                            type: 'deleteChannel',
                            device: hostDevice,
                            channel: channel
                        });
                        continue;
                    }
                    if (JSON.stringify(_channels[j].common) !== JSON.stringify(configToAdd[pos].channel.common))  {
                        tasks.push({
                            type: 'extendObject',
                            id:   _channels[j]._id,
                            data: {common: configToAdd[pos].channel.common}
                        });
                    }
                    tasks.push({
                        type: 'updateStatesOfChannel',
                        channelInfo: configToAdd[pos]
                    });
                    configToAdd.splice(pos, 1);
                }
            };

            if (configToAdd.length) {
                for (var r = 0; r < configToAdd.length; r++) {
                    tasks.push({
                        type: 'createChannel',
                        channelInfo: configToAdd[r]
                    });
                }
            }
            processTasks(tasks, callback);
        });
    });
}

function main() {
    hostDeviceName = adapter.config.noHostname ? null : adapter.host;
    hostDevice = hostDeviceName ? hostDeviceName.replace(/[.\s]+/g, '_') : ''
    adapter.log.debug('Host=' + (hostDeviceName || ' no host name'));

    if (!adapter.config.devices.length) {
        adapter.log.warn('No one host configured for ping');
        stop();
        return;
    }

    adapter.config.interval = parseInt(adapter.config.interval, 10);

    if (adapter.config.interval < 5000) adapter.config.interval = 5000;

    syncConfig(function () {
        pingAll();
    });
}
