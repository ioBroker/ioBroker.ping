/**
 *
 *      ioBroker PING Adapter
 *
 *      (c) 2014-2025 bluefox <dogafox@gmail.com>
 *
 *      MIT License
 *
 */
import { Adapter, type AdapterOptions, I18n } from '@iobroker/adapter-core';
import * as ip from 'ip';

import * as ping from './lib/ping';
import allowPing from './lib/setcup';
import type { DeviceConfig, PingAdapterConfig } from './types';

const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;

interface DetectedIP {
    ip: string;
    mac?: string;
    vendor?: string;
    ignore: boolean;
}

interface BrowseInterface {
    ip: string;
    netmask: string;
    rangeStart?: string | ioBroker.StateValue;
    rangeLength?: number | string | ioBroker.StateValue;
}

interface ObjId {
    device: string;
    channel: string;
    state: string;
}

interface PingTask {
    host: string;
    extendedInfo: boolean;
    stateAlive: string;
    stateTime?: string;
    stateRps?: string;
    online?: boolean;
}

interface PreparedObjects {
    device?: ioBroker.DeviceObject;
    channels: ioBroker.ChannelObject[];
    states: ioBroker.StateObject[];
    pingTaskList: PingTask[];
}

interface HostObjects {
    ping_task: PingTask;
    channel?: ioBroker.ChannelObject;
    states: ioBroker.StateObject[];
}

interface TemporaryAddress {
    ip: string;
    name?: string;
}

class PingAdapter extends Adapter {
    declare config: PingAdapterConfig;

    private stopBrowsing = false;
    private runningBrowse = false;
    private arpToMac: ((ip: string) => Promise<string | null>) | null = null;
    private toVendor: ((mac: string) => string) | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private timerUnreach: ReturnType<typeof setTimeout> | null = null;
    private isStopping = false;
    private detectedIPs: DetectedIP[] = [];
    private cyclicPingTimeout: ReturnType<typeof setTimeout> | null = null;
    private temporaryAddressesToAdd: TemporaryAddress[] = [];

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'ping',
            message: obj => this.processMessage(obj),
            ready: () => this.main(),
            unload: () => {
                if (this.timer) {
                    clearTimeout(this.timer);
                    this.timer = null;
                }
                if (this.cyclicPingTimeout) {
                    clearTimeout(this.cyclicPingTimeout);
                    this.cyclicPingTimeout = null;
                }
                if (this.timerUnreach) {
                    clearTimeout(this.timerUnreach);
                    this.timerUnreach = null;
                }

                this.isStopping = true;
            },
            stateChange: (id: string, state: ioBroker.State | null | undefined): void => {
                if (state && !state.val && !state.ack && id.endsWith('.browse.running')) {
                    this.stopBrowsing = true;
                } else if (state && state.val && !state.ack && id.endsWith('.browse.result')) {
                    // read ignore states of IP addresses
                    try {
                        const ips: DetectedIP[] = JSON.parse(state.val as string);
                        ips.forEach(item => {
                            if (item.ignore) {
                                const it = this.detectedIPs.find(d => d.ip === item.ip);
                                if (it) {
                                    it.ignore = true;
                                }
                            }
                        });
                    } catch (e) {
                        this.log.warn(`Cannot parse browse result: ${e}`);
                    }
                }
            },
        });
    }

    async browse(ifaceParam?: string | BrowseInterface): Promise<void> {
        if (this.runningBrowse) {
            this.log.warn(`Ignored browse command as already running`);
            return;
        }

        this.runningBrowse = true;

        let generateNotification = false;
        let iface: BrowseInterface | undefined;

        if (!ifaceParam || typeof ifaceParam === 'string') {
            let ifaceIp: string | undefined = ifaceParam;
            if (!ifaceIp) {
                // read the last selected interface
                const iState = await this.getStateAsync('browse.interface');
                // if nothing selected, nothing to do
                if (!iState || !iState.val) {
                    this.log.warn('No interface selected');
                    this.runningBrowse = false;
                    return;
                }
                ifaceIp = iState.val as string;
            }
            const rangeStart = await this.getStateAsync('browse.rangeStart');
            const rangeLength = await this.getStateAsync('browse.rangeLength');
            // get the host where this instance is running
            const config = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            // read the host interfaces
            const host = await this.getForeignObjectAsync(`system.host.${config!.common.host}`);
            if ((host?.native as any)?.hardware?.networkInterfaces) {
                const networkInterfaces: Record<string, any[]> = (host!.native as any).hardware.networkInterfaces;
                for (const iName of Object.keys(networkInterfaces)) {
                    const ifc = networkInterfaces[iName];
                    const _addr = ifc.find((addr: any) => addr.address === ifaceIp);
                    if (_addr) {
                        iface = { ip: _addr.address, netmask: _addr.netmask };
                        break;
                    }
                }
            }
            if (!iface) {
                if (!ifaceIp) {
                    this.log.warn(`No interface selected`);
                } else {
                    this.log.warn(`Defined interface "${ifaceIp}" does not exists on this host`);
                }
                this.runningBrowse = false;
                return;
            }
            iface.rangeStart = rangeStart?.val;
            iface.rangeLength = rangeLength?.val;

            generateNotification = true;
        } else {
            iface = ifaceParam;
            const iState = await this.getStateAsync('browse.interface');
            if (!iState || iState.val !== iface.ip) {
                await this.setStateAsync('browse.interface', iface.ip, true);
            }
        }
        iface.rangeStart = (iface.rangeStart as string) || '';
        iface.rangeLength = parseInt(String(iface.rangeLength), 10) || 0;

        this.detectedIPs = this.detectedIPs.filter(item => item.ignore);

        try {
            if (!this.arpToMac) {
                const arpModule = await import('@network-utils/arp-lookup');
                this.arpToMac = (arpModule.default || arpModule).toMAC;
            }
            if (!this.toVendor) {
                const vendorModule = await import('@network-utils/vendor-lookup');
                this.toVendor = (vendorModule.default || vendorModule).toVendor;
            }
        } catch {
            this.log.warn('Cannot use module "arp-lookup"');
        }

        const result =
            iface.rangeStart && iface.rangeLength
                ? { firstAddress: iface.rangeStart, length: iface.rangeLength }
                : ip.subnet(iface.ip, iface.netmask);

        if (result.length > 1024) {
            this.log.warn(`Too many IPs to ping: ${result.length}. Maximum is 1024`);
            this.runningBrowse = false;
            return;
        }
        this.runningBrowse = true;
        let progress = 0;
        await this.setStateAsync('browse.result', JSON.stringify(this.detectedIPs), true);
        await this.setStateAsync('browse.running', true, true);
        await this.setStateAsync('browse.progress', 0, true);
        await this.setStateAsync('browse.status', `0 / ${result.length}`, true);

        this.stopBrowsing = false;
        let addr = result.firstAddress;
        for (let i = 0; i < result.length; i++) {
            // ping addr
            progress = Math.round((i / result.length) * 255);

            // do not ping the already configured and ignored devices
            if (!this.config.devices.find(dev => dev.ip === addr) && !this.detectedIPs.find(item => item.ip === addr)) {
                await new Promise<void>(resolve =>
                    ping.probe(addr, { log: this.log.debug }, async (_err, status) => {
                        if (status?.alive) {
                            console.log(`Found ${status.host}`);
                            let mac: string | undefined;
                            let vendorName: string | undefined;
                            if (this.arpToMac) {
                                mac = (await this.arpToMac(status.host)) || undefined;
                                if (mac && this.toVendor) {
                                    vendorName = this.toVendor(mac);
                                }
                            }
                            const item = this.detectedIPs.find(d => d.ip === status.host);
                            let changed = false;
                            if (item) {
                                if (item.mac !== mac || item.vendor !== vendorName) {
                                    changed = true;
                                    item.mac = mac || item.mac;
                                    item.vendor = vendorName || item.vendor;
                                }
                            } else {
                                this.detectedIPs.push({ ip: status.host, mac, vendor: vendorName, ignore: false });
                                this.detectedIPs.sort((a, b) => (a.ip > b.ip ? 1 : a.ip < b.ip ? -1 : 0));
                                changed = true;
                            }
                            if (changed) {
                                await this.setStateAsync('browse.result', JSON.stringify(this.detectedIPs), true);
                            }
                        } else {
                            console.log(`Progress ${progress} / 255`);
                        }
                        resolve();
                    }),
                );
            }

            if (this.stopBrowsing) {
                break;
            }

            addr = ip.fromLong(ip.toLong(addr) + 1);

            await this.setStateAsync('browse.status', `${i} / ${result.length}`, true);
            await this.setStateAsync('browse.progress', progress, true);
        }
        await this.setStateAsync('browse.running', false, true);
        await this.setStateAsync('browse.progress', 0, true);
        this.runningBrowse = false;
        this.stopBrowsing = false;

        const newDevices = this.detectedIPs.filter(
            item => !item.ignore && !this.config.devices.find(dev => dev.ip === item.ip),
        );
        if (generateNotification && newDevices.length) {
            await this.registerNotification(
                'ping',
                'newDevices',
                newDevices.length === 1
                    ? I18n.translate('New device found')
                    : I18n.translate('%s new devices found', newDevices.length.toString()),
                {
                    contextData: {
                        admin: {
                            notification: {
                                offlineMessage: I18n.getTranslatedObject('Instance is offline'),
                                newDevices,
                            },
                        },
                    },
                },
            );
        }
    }

    getGuiSchema(newDevices: DetectedIP[]): Record<string, any> {
        const schema: { type: string; items: Record<string, any> } = {
            type: 'panel',
            items: {
                _info: {
                    type: 'header',
                    size: 5,
                    text: I18n.getTranslatedObject('New devices found'),
                    sm: 12,
                },
            },
        };

        let added = 0;
        newDevices?.forEach((device, i) => {
            if (this.config.devices.find(dev => dev.ip === device.ip)) {
                return;
            }
            added++;
            schema.items[`_device_${i}_ip`] = {
                newLine: true,
                type: 'staticText',
                noTranslation: true,
                text: `${device.ip}${device.vendor || device.mac ? ` [${device.vendor || (device.mac || '').substring(0, 9)}]` : ''}`,
                sm: 8,
                style: {
                    marginTop: 5,
                },
            };
            const included = !!this.temporaryAddressesToAdd.find(item => item.ip === device.ip);
            schema.items[`_device_${i}_btn`] = {
                type: 'sendto',
                command: 'ping:addIpAddress',
                data: { ip: device.ip, vendor: device.vendor },
                label: included ? '-' : '+',
                noTranslation: true,
                sm: 4,
                variant: included ? 'text' : 'contained',
                controlStyle: {
                    width: 30,
                    minWidth: 30,
                },
            };
        });

        if (!added) {
            // delete info text
            schema.items = {};
            schema.items._noDevices = {
                type: 'staticText',
                text: I18n.getTranslatedObject('Notification is not actual. All found devices are already added.'),
                sm: 12,
            };
        }

        schema.items._open = {
            newLine: true,
            type: 'staticLink',
            href: '#tab-instances/config/system.adapter.ping.0/_browse',
            close: true,
            label: I18n.getTranslatedObject('Open settings'),
            variant: 'contained',
            sm: 12,
            md: 6,
            lg: 4,
            xl: 2,
            button: true,
            icon: 'open',
        };

        if (this.temporaryAddressesToAdd.length) {
            schema.items._save = {
                type: 'sendto',
                command: 'ping:save',
                label: I18n.getTranslatedObject('Save settings'),
                variant: 'contained',
                icon: 'save',
                sm: 12,
                md: 6,
                lg: 4,
                xl: 2,
            };
        }

        return schema;
    }

    async processMessage(obj: ioBroker.Message): Promise<void> {
        if (!obj || !obj.command) {
            return;
        }
        switch (obj.command) {
            case 'ping': {
                // Try to ping one IP or name
                if (obj.callback && obj.message) {
                    ping.probe(obj.message as string, { log: this.log.debug }, (err, result) =>
                        this.sendTo(obj.from, obj.command, { result, error: err }, obj.callback),
                    );
                }
                break;
            }

            case 'ping:settings:browse': {
                const intr = obj.message;
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { result: 'started' }, obj.callback);
                }

                // Try to ping all IPs of the network
                this.browse(intr as string | BrowseInterface).catch(error => this.log.error(`Cannot browse: ${error}`));

                break;
            }

            case 'ping:addIpAddress': {
                const msg = obj.message as { ip?: string; vendor?: string } | undefined;
                if (msg?.ip) {
                    const index = this.temporaryAddressesToAdd.findIndex(item => item.ip === msg.ip);
                    if (index === -1) {
                        this.temporaryAddressesToAdd.push({ ip: msg.ip, name: msg.vendor });
                        console.log(`Add ${msg.ip}`);
                    } else {
                        console.log(`Remove ${msg.ip}`);
                        this.temporaryAddressesToAdd.splice(index, 1);
                    }
                }

                this.sendTo(
                    obj.from,
                    obj.command,
                    {
                        command: {
                            command: 'nop',
                            refresh: !!obj.message?.ip,
                        },
                    },
                    obj.callback,
                );

                break;
            }

            case 'ping:save': {
                const config = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                let changed = false;
                this.temporaryAddressesToAdd.forEach(item => {
                    if (!(config!.native as any).devices.find((dev: any) => dev.ip === item.ip)) {
                        (config!.native as any).devices.push({ enabled: true, ip: item.ip, name: item.name });
                        changed = true;
                    }
                });
                this.temporaryAddressesToAdd = [];
                // adapter will be restarted
                if (changed) {
                    await this.setForeignObjectAsync(config!._id, config as any);
                }
                this.sendTo(
                    obj.from,
                    obj.command,
                    {
                        command: {
                            command: 'message',
                            message: I18n.getTranslatedObject('Saved'),
                            refresh: true,
                        },
                    },
                    obj.callback,
                );
                break;
            }

            case 'admin:getNotificationSchema':
            case 'getNotificationSchema': {
                const schema = this.getGuiSchema(obj.message.newDevices);
                this.sendTo(obj.from, obj.command, { schema }, obj.callback);
                break;
            }
        }
    }

    async pingAll(taskList: PingTask[], isUnreach?: boolean): Promise<void> {
        for (let t = 0; t < taskList.length; t++) {
            const task = taskList[t];
            if ((isUnreach && task.online) || (!isUnreach && !task.online)) {
                continue;
            }

            this.log.debug(`Pinging ${isUnreach ? 'offline' : 'alive'} ${task.host}`);

            let counter = 0;
            do {
                const result = await this.pingSingleDevice(task, counter);
                if (result || this.isStopping) {
                    break;
                }
                counter++;
            } while (counter <= this.config.numberOfRetries);

            if (this.isStopping) {
                break;
            }
        }

        // start next ping
        if (!this.isStopping) {
            if (isUnreach) {
                this.timerUnreach = setTimeout(async () => {
                    this.timerUnreach = null;
                    await this.pingAll(taskList, true);
                }, this.config.intervalByUnreach);
            } else {
                this.timer = setTimeout(async () => {
                    this.timer = null;
                    await this.pingAll(taskList);
                }, this.config.interval);
            }
        }
    }

    pingSingleDevice(task: PingTask, retryCounter: number): Promise<boolean> {
        return new Promise(resolve =>
            ping.probe(task.host, { log: this.log.debug }, async (err, result) => {
                err && this.log.error(`Error by pinging: ${err}`);

                if (result) {
                    this.log.debug(
                        `Ping result for ${result.host}: ${result.alive} in ${
                            result.ms === null ? '-' : result.ms
                        }ms (Tried ${retryCounter}/${this.config.numberOfRetries} times)`,
                    );

                    if (!result.alive && retryCounter < this.config.numberOfRetries) {
                        /* When the ping failed, it also could be a device problem.
                           Some Android phones sometimes don't answer to a ping,
                           but do in fact answer for the following ping.
                           So we are giving the device some more attempts until it finally fails.
                         */
                        resolve(false);
                        return;
                    }
                    await this.setDeviceStates(task, result);
                } else if (!err) {
                    this.log.warn(`No result by pinging of ${task.host}`);
                }
                resolve(true);
            }),
        );
    }

    async setDeviceStates(task: PingTask, result: ping.PingResult): Promise<void> {
        task.online = result.alive;
        if (task.extendedInfo) {
            await this.setStateAsync(task.stateAlive, { val: result.alive, ack: true });
            await this.setStateAsync(task.stateTime!, {
                val: result.ms === null ? null : result.ms / 1000,
                ack: true,
            });

            let rps = 0;
            if (result.alive && result.ms !== null && result.ms > 0) {
                rps = result.ms <= 1 ? 1000 : 1000.0 / result.ms;
            }
            await this.setStateAsync(task.stateRps!, { val: rps, ack: true });
        } else {
            await this.setStateAsync(task.stateAlive, { val: result.alive, ack: true });
        }
    }

    buildId(id: { device?: string; channel?: string; state?: string }): string {
        return (
            this.namespace +
            (id.device ? `.${id.device}` : '') +
            (id.channel ? `.${id.channel}` : '') +
            (id.state ? `.${id.state}` : '')
        );
    }

    isDevicesEqual(rhs: ioBroker.DeviceObject, lhs: ioBroker.DeviceObject): boolean {
        return rhs.common.name === lhs.common.name;
    }

    isChannelsEqual(rhs: ioBroker.ChannelObject, lhs: ioBroker.ChannelObject): boolean {
        return rhs.common.name === lhs.common.name && (rhs.native as any).host === lhs.native.host;
    }

    isStatesEqual(rhs: ioBroker.StateObject, lhs: ioBroker.StateObject): boolean {
        return (
            rhs.common.name === lhs.common.name &&
            (rhs.common as any).def === lhs.common.def &&
            (rhs.common as any).min === lhs.common.min &&
            (rhs.common as any).max === lhs.common.max &&
            rhs.common.type === lhs.common.type &&
            (rhs.common as any).unit === lhs.common.unit &&
            (rhs.common as any).read === lhs.common.read &&
            (rhs.common as any).write === lhs.common.write &&
            rhs.common.role === lhs.common.role &&
            (rhs.native as any).host === lhs.native.host
        );
    }

    async syncObjects(
        preparedObjects: PreparedObjects,
        oldObjects: Record<string, ioBroker.Object | undefined>,
    ): Promise<void> {
        if (preparedObjects.device) {
            const fullID = preparedObjects.device._id;
            const oldObj = oldObjects[fullID];

            if (oldObj?.type === 'device') {
                if (!this.isDevicesEqual(oldObj, preparedObjects.device)) {
                    await this.extendObject(fullID, {
                        common: preparedObjects.device.common,
                    });
                }
                oldObjects[fullID] = undefined;
            } else {
                try {
                    await this.setObjectAsync(fullID, {
                        common: preparedObjects.device.common,
                        type: 'device',
                        native: {},
                    } as ioBroker.SettableObject);
                } catch (err) {
                    this.log.error(`Cannot create device: ${fullID} Error: ${err}`);
                }
            }
        }

        for (let c = 0; c < preparedObjects.channels.length; c++) {
            const channel = preparedObjects.channels[c];
            const fullID = channel._id;
            const oldObj = oldObjects[fullID];

            if (oldObj?.type === 'channel') {
                if (!this.isChannelsEqual(oldObj, channel)) {
                    this.log.debug(`Update channel id=${fullID}`);
                    await this.extendObjectAsync(fullID, {
                        common: channel.common,
                        native: channel.native,
                    } as any);
                }
                oldObjects[fullID] = undefined;
            } else {
                this.log.debug(`Create channel id=${fullID}`);

                try {
                    await this.setObjectAsync(fullID, {
                        type: 'channel',
                        common: channel.common,
                        native: channel.native,
                    } as ioBroker.SettableObject);
                } catch (err) {
                    this.log.error(`Cannot create channel: ${fullID} Error: ${err}`);
                }
            }
        }

        for (let s = 0; s < preparedObjects.states.length; s++) {
            const state = preparedObjects.states[s];
            const fullID = state._id;
            const oldObj = oldObjects[fullID];

            if (oldObj && oldObj.type === 'state') {
                if (!this.isStatesEqual(oldObj, state)) {
                    this.log.debug(`Update state id=${fullID}`);

                    await this.extendObjectAsync(fullID, {
                        common: state.common,
                        native: state.native,
                    } as any);
                }
                oldObjects[fullID] = undefined;
            } else {
                this.log.debug(`Create state id=${fullID}`);

                try {
                    await this.setObjectAsync(fullID, {
                        type: 'state',
                        common: state.common,
                        native: state.native,
                    } as ioBroker.SettableObject);
                } catch (err) {
                    this.log.error(`Cannot create state: ${fullID} Error: ${err}`);
                }
            }
        }

        const keys = Object.keys(oldObjects);
        for (let d = 0; d < keys.length; d++) {
            const id = keys[d];
            if (oldObjects[id]) {
                await this.delObjectAsync(id);
            }
        }
    }

    prepareObjectsForHost(hostDevice: string, config: DeviceConfig): HostObjects {
        const host = (config.ip || '').trim();
        const name = (config.name || '').trim();
        const idName = (config.use_name ? name || host : host)
            .replace(FORBIDDEN_CHARS, '_')
            .replace(/[.\s]+/g, '_')
            .replace(/:/g, '_');

        if (config.extended_info) {
            const channelID: ObjId = { device: hostDevice, channel: idName, state: '' };

            const stateAliveID: ObjId = { device: hostDevice, channel: idName, state: 'alive' };
            const stateTimeID: ObjId = { device: hostDevice, channel: idName, state: 'time' };
            const stateRpsID: ObjId = { device: hostDevice, channel: idName, state: 'rps' };
            return {
                ping_task: {
                    host,
                    extendedInfo: true,
                    stateAlive: this.buildId(stateAliveID),
                    stateTime: this.buildId(stateTimeID),
                    stateRps: this.buildId(stateRpsID),
                },
                channel: {
                    _id: this.buildId(channelID),
                    type: 'channel',
                    common: {
                        name: name || host,
                        desc: `Ping of ${host}`,
                    },
                    native: {
                        host,
                    },
                },
                states: [
                    {
                        _id: this.buildId(stateAliveID),
                        type: 'state',
                        common: {
                            name: name ? `Alive ${name}` : host,
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
                    {
                        _id: this.buildId(stateTimeID),
                        type: 'state',
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
                        },
                    },
                    {
                        _id: this.buildId(stateRpsID),
                        type: 'state',
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
        }
        const stateID: ObjId = { device: hostDevice, channel: '', state: idName };
        return {
            ping_task: {
                host: config.ip.trim(),
                extendedInfo: false,
                stateAlive: this.buildId(stateID),
            },
            states: [
                {
                    _id: this.buildId(stateID),
                    type: 'state',
                    common: {
                        name: name ? `Alive ${name}` : host,
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

    prepareObjectsByConfig(): PreparedObjects {
        const result: PreparedObjects = {
            channels: [],
            states: [],
            pingTaskList: [],
        };
        const hostDeviceName = this.host;
        let hostDevice = '';

        this.log.debug(`Host=${hostDeviceName || ' no host name'}`);

        if (!this.config.noHostname) {
            hostDevice = hostDeviceName ? hostDeviceName.replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_') : '';
            result.device = {
                _id: this.buildId({
                    device: hostDevice,
                }),
                type: 'device',
                common: {
                    name: hostDeviceName || 'Unnamed host',
                },
                native: {},
            };
        }

        const pingTaskList: PingTask[] = [];
        const channels: ioBroker.ChannelObject[] = [];
        let states: ioBroker.StateObject[] = [];
        const usedIDs: Record<string, DeviceConfig> = {};

        this.config.devices.forEach(device => {
            if (device.enabled === false) {
                return;
            }

            const config = this.prepareObjectsForHost(hostDevice, device);

            if (config.channel) {
                const fullID = config.channel._id;
                if (usedIDs[fullID]) {
                    this.log.warn(
                        `Objects with same id = ${fullID} created for two hosts ${JSON.stringify(usedIDs[fullID])}  ${JSON.stringify(device)}`,
                    );
                } else {
                    usedIDs[fullID] = device;
                }
                channels.push(config.channel);
            }

            config.states.forEach(state => {
                const fullID = state._id;
                if (usedIDs[fullID]) {
                    this.log.warn(
                        `Objects with same id = ${fullID} created for two hosts ${JSON.stringify(usedIDs[fullID])}  ${JSON.stringify(device)}`,
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

    async pingOnTime(): Promise<void> {
        if (this.isStopping) {
            return;
        }
        const started = Date.now();
        try {
            await this.browse();
        } catch (e) {
            this.log.error(`Cannot browse: ${e}`);
        }

        if (this.isStopping) {
            return;
        }

        this.cyclicPingTimeout = setTimeout(
            () => {
                this.cyclicPingTimeout = null;
                if (this.isStopping) {
                    return;
                }
                this.pingOnTime().catch(e => this.log.error(`Cannot start auto detect: ${e}`));
            },
            this.config.autoDetect * 60000 - (Date.now() - started),
        );
    }

    async syncConfig(): Promise<PingTask[]> {
        this.log.debug('Prepare objects');
        const preparedObjects = this.prepareObjectsByConfig();
        this.log.debug('Get existing objects');

        const objects: Record<string, ioBroker.Object | undefined> = (await this.getAdapterObjectsAsync()) as Record<
            string,
            ioBroker.Object | undefined
        >;
        Object.keys(objects).forEach(id => {
            if (id.startsWith(`${this.namespace}.browse`)) {
                delete objects[id];
            }
        });
        // remove browse folder
        this.log.debug('Prepare tasks of objects update');
        await this.syncObjects(preparedObjects, objects);

        this.log.debug('Start tasks of objects update');
        return preparedObjects.pingTaskList;
    }

    async main(): Promise<void> {
        await this.setStateAsync('browse.running', false, true);
        await this.setStateAsync('browse.progress', 0, true);
        await this.setStateAsync('browse.status', '', true);
        // fix browse.rangeLength
        const rangeLength = await this.getStateAsync('browse.rangeLength');
        if (rangeLength && (rangeLength.val === '0' || rangeLength.val === '')) {
            await this.setStateAsync('browse.rangeLength', 0, true);
        }

        await I18n.init(`${__dirname}/lib`, this);

        this.config.autoDetect = parseInt(String(this.config.autoDetect), 10) || 0;

        const res = await this.getStateAsync('browse.result');
        if (res?.val) {
            try {
                this.detectedIPs = JSON.parse(res.val.toString());
            } catch {
                this.detectedIPs = [];
            }
        }

        this.subscribeStates('browse.running');
        this.subscribeStates('browse.result');

        this.config.interval = parseInt(String(this.config.interval), 10);

        if (this.config.interval < 5000) {
            this.log.warn('Poll interval is too short. Reset to 5000 ms.');
            this.config.interval = 5000;
        }
        if (!this.config.intervalByUnreach) {
            this.config.intervalByUnreach = this.config.interval;
        }

        this.config.intervalByUnreach = parseInt(String(this.config.intervalByUnreach), 10);
        if (this.config.intervalByUnreach < 5000) {
            this.log.warn('Offline poll interval is too short. Reset to 5000 ms.');
            this.config.intervalByUnreach = 5000;
        }

        this.config.numberOfRetries = parseInt(String(this.config.numberOfRetries), 10) || 1;

        if (this.config.numberOfRetries < 1) {
            this.log.warn('Number of retries is to low. Reset to 1.');
            this.config.numberOfRetries = 1;
        }

        if (this.config.setcap) {
            try {
                await allowPing();
            } catch (e) {
                this.log.warn(`Cannot allow setcap for ping: ${e}`);
            }
        }

        if (this.config.autoDetect) {
            this.pingOnTime().catch(e => this.log.error(`Cannot start auto detect: ${e}`));
        }
        if (!this.config.devices || !this.config.devices.length) {
            this.log.warn('No one host configured for ping');
            return;
        }

        const pingTaskList = await this.syncConfig();
        await this.pingAll(pingTaskList);
        await this.pingAll(pingTaskList, true);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new PingAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new PingAdapter())();
}
