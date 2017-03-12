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
var adapter    = utils.adapter('ping');

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
    if (adapter.common && adapter.common.mode == 'schedule') {
        stopTimer = setTimeout(function () {
            stopTimer = null;
            if (timer) clearInterval(timer);
            isStopping = true;
            adapter.stop();
        }, 30000);
    }
}

var host  = ''; // Name of the PC, where the ping runs

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

    var ip = hosts.pop();
    adapter.log.debug('Pinging ' + ip);

    ping.probe(ip, {log: adapter.log.debug}, function (err, result) {
        if (err) adapter.log.error(err);
        if (result) {
            adapter.log.debug('Ping result for ' + result.host + ': ' + result.alive + ' in ' + (result.ms === null ? '-' : result.ms) + 'ms');
            adapter.setState({device: '', channel: host ? host.replace(/[.\s]+/g, '_') : '', state: result.host.replace(/[.\s]+/g, '_')},         {val: result.alive, ack: true});
            //adapter.setState({device: '', channel: host, state: result.host.replace(/[.\s]+/g, '_') + '.ms'}, {val: result.ms,    ack: true});
        }
        if (!isStopping) {
            setTimeout(function () {
                pingAll(hosts);
            }, 0);
        }
    });
}

function createState(name, ip, room, callback) {
    var id = ip.replace(/[.\s]+/g, '_');

    if (room) {
        adapter.addStateToEnum('room', room, '', host, id);
        //adapter.addStateToEnum('room', room, '', host, id + '.ms');
    }

    adapter.createState('', host, id, {
        name:   name || ip,
        def:    false,
        type:   'boolean',
        read:   'true',
        write:  'false',
        role:   'indicator.reachable',
        desc:   'Ping state of ' + ip
    }, {
        ip: ip
    }, callback);

    /*adapter.createState('', host, id + '.ms', {
        name:   'Response for ' + (name || ip),
        def:    0,
        type:   'number',
        read:   'true',
        write:  'false',
        role:   'value',
        desc:   'Response time in ms for ' + ip
    }, {
        ip: ip
    }, callback);*/
}

function addState(name, ip, room, callback) {
    if (host) {
        adapter.getObject(host, function (err, obj) {
            if (err || !obj) {
                // if root does not exist, channel will not be created
                adapter.createChannel('', host.replace(/[.\s]+/g, '_'), [], function () {
                    createState(name, ip, room, callback);
                });
            } else {
                createState(name, ip, room, callback);
            }
        });
    } else {
        createState(name, ip, room, callback);
    }
}

function syncConfig(callback) {
    adapter.getStatesOf('', host, function (err, _states) {
        var configToDelete = [];
        var configToAdd    = [];
        var k;
        var id;
        if (adapter.config.devices) {
            for (k = 0; k < adapter.config.devices.length; k++) {
                configToAdd.push(adapter.config.devices[k].ip);
            }
        }

        if (_states) {
            for (var j = 0; j < _states.length; j++) {
                var ip = _states[j].native.ip;
                if (!ip) {
                    adapter.log.warn('No IP address found for ' + JSON.stringify(_states[j]));
                    continue;
                }
                id = ip.replace(/[.\s]+/g, '_');
                var pos = configToAdd.indexOf(ip);
                if (pos != -1) {
                    configToAdd.splice(pos, 1);
                    // Check name and room
                    for (var u = 0; u < adapter.config.devices.length; u++) {
                        if (adapter.config.devices[u].ip == ip) {
                            if (_states[j].common.name != (adapter.config.devices[u].name || adapter.config.devices[u].ip)) {
                                adapter.extendObject(_states[j]._id, {common: {name: (adapter.config.devices[u].name || adapter.config.devices[u].ip)}});
                            }
                            if (adapter.config.devices[u].room) {
                                adapter.addStateToEnum('room', adapter.config.devices[u].room, '', host, id);
                            } else {
                                adapter.deleteStateFromEnum('room', '', host, id);
                            }
                        }
                    }
                } else {
                    configToDelete.push(ip);
                }
            }
        }

        if (configToAdd.length) {
            var count = 0;
            for (var r = 0; r < adapter.config.devices.length; r++) {
                if (configToAdd.indexOf(adapter.config.devices[r].ip) != -1) {
                    count++;
                    addState(adapter.config.devices[r].name, adapter.config.devices[r].ip, adapter.config.devices[r].room, function () {
                        if (!--count && callback) callback();
                    });
                }
            }
        }
        if (configToDelete.length) {
            for (var e = 0; e < configToDelete.length; e++) {
                id = configToDelete[e].replace(/[.\s]+/g, '_');
                adapter.deleteStateFromEnum('room', '',  host, id);
                //adapter.deleteStateFromEnum('room', '',  host, id + '.ms');
                adapter.deleteState('', host, id);
                //adapter.deleteState('', host, id + '.ms');
            }
        }
        if (!count && callback) callback();
    });
}

function main() {
    host = adapter.config.noHostname ? null : adapter.host;
    adapter.log.debug('Host=' + (host || ' no host name'));

    if (!adapter.config.devices.length) {
        adapter.log.warn('No one IP configured for ping');
        stop();
        return;
    }

    adapter.config.interval = parseInt(adapter.config.interval, 10);

    if (adapter.config.interval < 5000) adapter.config.interval = 5000;

    syncConfig(function () {
        pingAll();
    });
}
