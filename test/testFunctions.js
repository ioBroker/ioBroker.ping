const expect = require('chai').expect;
const setup  = require('./lib/setup');

let objects = null;
let states  = null;
let onStateChanged = null;
const onObjectChanged = null;
const hostname = require('os').hostname();

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        cb && cb('Cannot check connection');
        return;
    }

    states.getState('system.adapter.ping.0.alive', (err, state) => {
        if (err) console.error(err);
        if (state && state.val) {
            cb && cb();
        } else {
            setTimeout(() => checkConnectionOfAdapter(cb, counter + 1), 1000);
        }
    });
}

function checkValueOfState(id, value, cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        cb && cb('Cannot check value Of State ' + id);
        return;
    }

    states.getState(id, (err, state) => {
        if (err) console.error(err);
        if (value === null && !state) {
            cb && cb();
        } else
        if (state && (value === undefined || state.val === value)) {
            cb && cb();
        } else {
            setTimeout(() => checkValueOfState(id, value, cb, counter + 1), 500);
        }
    });
}

describe('Test PING', function () {
    before('Test PING: Start js-controller', function (_done) {
        this.timeout(600000); // because of first install from npm

        setup.setupController(() => {
            const config = setup.getAdapterConfig();
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

            setup.startController(
                true,
                (id, obj) => onObjectChanged && onObjectChanged(id, obj),
                (id, state) => onStateChanged && onStateChanged(id, state),
            (_objects, _states) => {
                objects = _objects;
                states  = _states;
                states.subscribe('*');
                _done();
            });
        });
    });

    it('Test PING: Check if adapter started', done => {
        checkConnectionOfAdapter(done);
    }).timeout(5000);

    it('Test PING: check creation of state', done => {
        setTimeout(() => {
            // if object exists
            objects.getObject('ping.0.' + hostname + '.192_168_168_168', (err, obj) => {
                expect(err).to.be.not.ok;
                expect(obj).to.be.ok;
                objects.getObject('ping.0.' + hostname + '.google_com', (err, obj) => {
                    expect(err).to.be.not.ok;
                    expect(obj).to.be.ok;
                    objects.getObject('ping.0.' + hostname + '.127_0_0_1', (err, obj) => {
                        expect(err).to.be.not.ok;
                        expect(obj).to.be.ok;
                        setTimeout(done, 5000);
                    });
                });
            });
        }, 2000);
    }).timeout(10000);

    it('Test PING: if localhost alive', done => {
        const sID = 'ping.0.' + hostname + '.127_0_0_1';

        states.getState(sID, (err, state) => {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log(id + ': ' + JSON.stringify(state));
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
    }).timeout(8000);

    it('Test PING: if google alive', done => {
        const sID = 'ping.0.' + hostname + '.google_com';

        states.getState(sID, (err, state) => {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log(id + ': ' + JSON.stringify(state));
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
    }).timeout(1000);

    it('Test PING: if not_exist not alive', done => {
        const sID = 'ping.0.' + hostname + '.192_168_168_168';

        states.getState(sID, (err, state) => {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log(id + ': ' + JSON.stringify(state));
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
    }).timeout(3000);

    after('Test PING: Stop js-controller', function (done) {
        this.timeout(6000);

        setup.stopController(normalTerminated => {
            console.log('Adapter normal terminated: ' + normalTerminated);
            done();
        });
    });
});
