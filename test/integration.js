const path = require('node:path');
const { tests } = require('@iobroker/testing');
const { expect } = require('chai');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test PING adapter startup and state creation', (getHarness) => {
            const hostname = require('node:os').hostname();

            it('Should start adapter and create device states', async function () {
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

                // Wait additional time for pings to attempt completion
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Stop adapter
                await harness.stopAdapter();
            });
        });

        suite('Test PING adapter with localhost only', (getHarness) => {
            const hostname = require('node:os').hostname();

            it('Should create state for localhost', async function () {
                this.timeout(60000);
                const harness = getHarness();

                // Configure adapter with only localhost
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

                // Check if state exists (may fail to ping in restricted environments, but object should exist)
                const state = await harness.states.getStateAsync(stateId);
                expect(state, 'State for localhost should exist').to.not.be.null;

                // Note: In restricted environments (like Docker/CI), ping may not work
                // so we only verify the state exists, not its value

                // Stop adapter
                await harness.stopAdapter();
            });
        });
    }
});
