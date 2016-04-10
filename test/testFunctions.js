var expect = require('chai').expect;
var setup  = require(__dirname + '/lib/setup');

var objects = null;
var states  = null;
var onStateChanged = null;
var onObjectChanged = null;
var hostname = require('os').hostname();

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        cb && cb('Cannot check connection');
        return;
    }

    states.getState('system.adapter.ping.0.alive', function (err, state) {
        if (err) console.error(err);
        if (state && state.val) {
            cb && cb();
        } else {
            setTimeout(function () {
                checkConnectionOfAdapter(cb, counter + 1);
            }, 1000);
        }
    });
}

function checkValueOfState(id, value, cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        cb && cb('Cannot check value Of State ' + id);
        return;
    }

    states.getState(id, function (err, state) {
        if (err) console.error(err);
        if (value === null && !state) {
            cb && cb();
        } else
        if (state && (value === undefined || state.val === value)) {
            cb && cb();
        } else {
            setTimeout(function () {
                checkValueOfState(id, value, cb, counter + 1);
            }, 500);
        }
    });
}

describe('Test PING', function() {
    before('Test PING: Start js-controller', function (_done) {
        this.timeout(600000); // because of first install from npm

        setup.setupController(function () {
            var config = setup.getAdapterConfig();
            // enable adapter
            config.common.enabled  = true;
            config.common.loglevel = 'debug';

            config.native.devices = [
                {
                    name: 'localhost',
                    ip:   '127.0.0.1',
                    room: ''
                },
                {
                    name: 'google',
                    ip:   'google.com',
                    room: ''
                },
                {
                    name: 'not exists',
                    ip:   '192.168.168.168',
                    room: ''
                }
            ];

            setup.setAdapterConfig(config.common, config.native);

            setup.startController(true, function (id, obj) {
                    if (onObjectChanged) onObjectChanged(id, obj);
                }, function (id, state) {
                    if (onStateChanged) onStateChanged(id, state);
            },
            function (_objects, _states) {
                objects = _objects;
                states  = _states;
                states.subscribe('*');
                _done();
            });
        });
    });

    it('Test PING: Check if adapter started', function (done) {
        this.timeout(5000);
        checkConnectionOfAdapter(done);
    });

    it('Test PING: check creation of state', function (done) {
        this.timeout(2000);
        setTimeout(function () {
            // if object exists
            objects.getObject('ping.0.' + hostname + '.127_0_0_1', function (err, obj) {
                expect(err).to.be.not.ok;
                expect(obj).to.be.ok;
                objects.getObject('ping.0.' + hostname + '.google_com', function (err, obj) {
                    expect(err).to.be.not.ok;
                    expect(obj).to.be.ok;
                    objects.getObject('ping.0.' + hostname + '.192_168_168_168', function (err, obj) {
                        expect(err).to.be.not.ok;
                        expect(obj).to.be.ok;
                        done();
                    });
                });
            });
        }, 1000);
    });

    it('Test PING: if localhost alive', function (done) {
        this.timeout(8000);
        var sID = 'ping.0.' + hostname + '.127_0_0_1';

        states.getState(sID, function (err, state) {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log('[' + setup.getTime() + '] ' + id + ': ' + JSON.stringify(state));
                    if (id === sID) {
                        onStateChanged = null;
                        expect(state.val).to.be.true;
                        done();
                    }
                };
            } else {
                expect(state.val).to.be.true;
                done();
            }
        });
    });

    it('Test PING: if google alive', function (done) {
        this.timeout(1000);
        var sID = 'ping.0.' + hostname + '.google_com';

        states.getState(sID, function (err, state) {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log('[' + setup.getTime() + '] ' + id + ': ' + JSON.stringify(state));
                    if (id === sID) {
                        onStateChanged = null;
                        expect(state.val).to.be.true;
                        done();
                    }
                };
            } else {
                expect(state.val).to.be.true;
                done();
            }
        });
    });

    it('Test PING: if not_exist not alive', function (done) {
        this.timeout(3000);
        var sID = 'ping.0.' + hostname + '.192_168_168_168';

        states.getState(sID, function (err, state) {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log('[' + setup.getTime() + '] ' + id + ': ' + JSON.stringify(state));
                    if (id === sID) {
                        onStateChanged = null;
                        expect(state.val).to.be.false;
                        done();
                    }
                };
            } else {
                expect(state.val).to.be.false;
                done();
            }
        });
    });

    after('Test PING: Stop js-controller', function (done) {
        this.timeout(6000);

        setup.stopController(function (normalTerminated) {
            console.log('Adapter normal terminated: ' + normalTerminated);
            done();
        });
    });
});
