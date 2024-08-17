const expect = require('chai').expect;
const fs = require('node:fs');
const setup = require('@iobroker/legacy-testing');
const guiHelper = require('./guiHelper');

let objects = null;
let states  = null;
let onStateChanged = null;
const onObjectChanged = null;
const hostname = require('node:os').hostname();
let gPage;

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

function deleteFoldersRecursive(path) {
    if (path.endsWith('/')) {
        path = path.substring(0, path.length - 1);
    }
    if (fs.existsSync(path)) {
        const files = fs.readdirSync(path);
        for (const file of files) {
            const curPath = `${path}/${file}`;
            const stat = fs.statSync(curPath);
            if (stat.isDirectory()) {
                deleteFoldersRecursive(curPath);
                fs.rmdirSync(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        }
    }
}

function checkIsAdminStarted(states, cb, counter) {
    counter = counter === undefined ? 20 : counter;
    if (counter === 0) {
        return cb && cb(`Cannot check value of State system.adapter.admin.0.alive`);
    }

    states.getState('system.adapter.admin.0.alive', (err, state) => {
        console.log(`[${counter}]Check if admin is started "system.adapter.admin.0.alive" = ${JSON.stringify(state)}`);
        err && console.error(err);
        if (state?.val) {
            cb && cb();
        } else {
            setTimeout(() => checkIsAdminStarted(states, cb, counter - 1), 500);
        }
    });
}

function checkIsAdminStartedAsync(states, counter) {
    return new Promise(resolve => checkIsAdminStarted(states, resolve, counter));
}

async function screenshot(page, fileName) {
    page = page || gPage;
    await page.screenshot({ path: `${__dirname}/../tmp/screenshots/${fileName}.png` });
}

describe('Test PING', function () {
    before('Test PING: Start js-controller', function (_done) {
        this.timeout(600000); // because of the first installation from npm

        setup.setupController(['admin'], async systemConfig => {
            // disable statistics and set license accepted
            systemConfig.common.licenseConfirmed = true;
            systemConfig.common.diag = 'none';
            await setup.setObject('system.config', systemConfig);

            // lets the admin adapter start on port 18081
            const adminConfig = await setup.getAdapterConfig(0, 'admin');
            if (adminConfig?.common) {
                adminConfig.native.port = 18081;
                adminConfig.common.enabled = true;
                await setup.setAdapterConfig(adminConfig.common, adminConfig.native, 0, 'admin');
            }

            const config = await setup.getAdapterConfig();
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

            await setup.setAdapterConfig(config.common, config.native);

            setup.startController(
                true,
                (id, obj) => onObjectChanged && onObjectChanged(id, obj),
                (id, state) => onStateChanged && onStateChanged(id, state),
            async (_objects, _states) => {
                objects = _objects;
                states  = _states;
                states.subscribe('*');
                setup.startCustomAdapter('admin', 0);
                await checkIsAdminStartedAsync(states);
                const { page } = await guiHelper.startBrowser(process.env.CI === 'true');
                gPage = page;
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
            objects.getObject(`ping.0.${hostname}.192_168_168_168`, (err, obj) => {
                expect(err).to.be.not.ok;
                expect(obj).to.be.ok;
                objects.getObject(`ping.0.${hostname}.google_com`, (err, obj) => {
                    expect(err).to.be.not.ok;
                    expect(obj).to.be.ok;
                    objects.getObject(`ping.0.${hostname}.127_0_0_1`, (err, obj) => {
                        expect(err).to.be.not.ok;
                        expect(obj).to.be.ok;
                        setTimeout(done, 5000);
                    });
                });
            });
        }, 10000);
    }).timeout(20000);

    it('Test PING: if localhost alive', done => {
        const sID = `ping.0.${hostname}.127_0_0_1`;

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
                console.log(`${sID}: ${JSON.stringify(state)}`);
                expect(state.val).to.be.true;
                done();
            }
        });
    }).timeout(8000);

    it('Test PING: if google alive', done => {
        const sID = `ping.0.${hostname}.google_com`;

        if (!((process.env.APPVEYOR && process.env.APPVEYOR === 'True') || (process.env.TRAVIS && process.env.TRAVIS === 'true'))) {
            done();
            return;
        }

        states.getState(sID, (err, state) => {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log(`${id}: ${JSON.stringify(state)}`);
                    if (id === sID) {
                        onStateChanged = null;
                        expect(state.val).to.be.true;
                        done();
                    }
                };
            } else {
                console.log(`${sID}: ${JSON.stringify(state)}`);
                expect(state.val).to.be.true;
                done();
            }
        });
    }).timeout(1000);

    it('Test PING: if not_exist not alive', done => {
        const sID = `ping.0.${hostname}.192_168_168_168`;

        if (!((process.env.APPVEYOR && process.env.APPVEYOR === 'True') || (process.env.TRAVIS && process.env.TRAVIS === 'true'))) {
            done();
            return;
        }

        states.getState(sID, (err, state) => {
            expect(err).to.be.not.ok;
            if (!state || !state.ack) {
                onStateChanged = function (id, state) {
                    console.log(`${id}: ${JSON.stringify(state)}`);
                    if (id === sID) {
                        onStateChanged = null;
                        expect(state.val).to.be.false;
                        done();
                    }
                };
            } else {
                console.log(`${sID}: ${JSON.stringify(state)}`);
                expect(state.val).to.be.false;
                done();
            }
        });
    }).timeout(3000);

    it('Start admin', async function () {
        deleteFoldersRecursive(`${__dirname}/../tmp/screenshots`);
        this.timeout(120_000);
        await gPage.waitForSelector('a[href="/#easy"]', { timeout: 120_000 });
        await screenshot(gPage, '00_started');
    });

    it('Test GUI', async () => {
        await gPage.goto(`http://127.0.0.1:18081/#tab-instances/config/system.adapter.ping.0`, { waitUntil: 'domcontentloaded' });
        await gPage.waitForSelector('button.MuiTab-root', { timeout: 20_000 });
        // if slow connection dialog is opened, close it
        const cancel = await gPage.$$('#ar_dialog_confirm_cancel_');
        if (cancel.length) {
            await cancel[0].click();
        }
        const buttons = await gPage.$$('button.MuiTab-root');
        buttons[2].click();
        await gPage.waitForSelector('.ping_custom', { timeout: 20_000 });
        await screenshot(gPage, '01_instance');
    }).timeout(60000);

    after('Test PING: Stop js-controller', function (done) {
        this.timeout(6000);
        setup.stopCustomAdapter('admin', 0)
            .then(async () => {
                await guiHelper.stopBrowser();

                setup.stopController(normalTerminated => {
                    console.log(`Adapter normal terminated: ${normalTerminated}`);
                    done();
                });
            });
    });
});
