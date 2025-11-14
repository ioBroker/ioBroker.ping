const path = require('node:path');
const { tests } = require('@iobroker/testing');
const { expect } = require('chai');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test PING adapter functionality', (getHarness) => {
            const hostname = require('node:os').hostname();

            it('Should start adapter and create states', async function () {
                this.timeout(60000);
                const harness = getHarness();

                // Configure adapter
                await harness.changeAdapterConfig('ping', {
                    native: {
                        devices: [
                            {
                                name: 'localhost',
                                ip: '127.0.0.1',
                                room: ''
                            },
                            {
                                name: 'google',
                                ip: 'google.com',
                                room: ''
                            },
                            {
                                name: 'not exists',
                                ip: '192.168.168.168',
                                room: ''
                            }
                        ]
                    },
                    common: {
                        enabled: true,
                        loglevel: 'debug'
                    }
                });

                // Start the adapter and wait for it to be running
                await harness.startAdapterAndWait();

                // Wait for states to be created
                await new Promise(resolve => setTimeout(resolve, 10000));

                // Check if the objects were created
                const obj1 = await harness.objects.getObjectAsync(`ping.0.${hostname}.192_168_168_168`);
                expect(obj1, 'Object for 192.168.168.168 should exist').to.not.be.null;

                const obj2 = await harness.objects.getObjectAsync(`ping.0.${hostname}.google_com`);
                expect(obj2, 'Object for google.com should exist').to.not.be.null;

                const obj3 = await harness.objects.getObjectAsync(`ping.0.${hostname}.127_0_0_1`);
                expect(obj3, 'Object for 127.0.0.1 should exist').to.not.be.null;

                // Wait additional time for pings to complete
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Stop adapter
                await harness.stopAdapter();
            });

            it('Should show localhost as alive', async function () {
                this.timeout(60000);
                const harness = getHarness();

                // Configure adapter
                await harness.changeAdapterConfig('ping', {
                    native: {
                        devices: [
                            {
                                name: 'localhost',
                                ip: '127.0.0.1',
                                room: ''
                            }
                        ]
                    },
                    common: {
                        enabled: true,
                        loglevel: 'debug'
                    }
                });

                // Start the adapter
                await harness.startAdapterAndWait();

                const stateId = `ping.0.${hostname}.127_0_0_1`;

                // Wait for the ping to complete
                await new Promise(resolve => setTimeout(resolve, 8000));

                const state = await harness.states.getStateAsync(stateId);
                expect(state, 'State for localhost should exist').to.not.be.null;
                expect(state.val, 'Localhost should be alive').to.be.true;
                expect(state.ack, 'State should be acknowledged').to.be.true;

                // Stop adapter
                await harness.stopAdapter();
            });
        });
    }
});
