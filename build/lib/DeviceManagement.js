"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dm_utils_1 = require("@iobroker/dm-utils");
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;
class PingDeviceManagement extends dm_utils_1.DeviceManagement {
    getInstanceInfo() {
        return {
            apiVersion: 'v3',
            actions: [],
        };
    }
    loadDevices(context) {
        const devices = this.adapter.config.devices;
        if (!devices?.length) {
            return;
        }
        context.setTotalDevices(devices.filter(d => d.enabled !== false).length);
        for (const device of devices) {
            if (device.enabled === false) {
                continue;
            }
            const host = (device.ip || '').trim();
            const name = (device.name || '').trim();
            const idName = (device.use_name ? name || host : host)
                .replace(FORBIDDEN_CHARS, '_')
                .replace(/[.\s]+/g, '_')
                .replace(/:/g, '_');
            // Determine connection status from current ping task
            const task = this.adapter.getTaskByDeviceId(idName);
            const isConnected = task?.online === true;
            const actions = [
                {
                    id: 'rePing',
                    icon: 'refresh',
                    description: {
                        en: 'Re-Ping',
                        de: 'Erneut pingen',
                        ru: 'Повторный пинг',
                        pt: 'Re-Ping',
                        nl: 'Re-Ping',
                        fr: 'Re-Ping',
                        it: 'Re-Ping',
                        es: 'Re-Ping',
                        pl: 'Re-Ping',
                        uk: 'Повторний пінг',
                        'zh-cn': '重新 Ping',
                    },
                    handler: async (_id, context) => {
                        const online = await this.adapter.rePingDevice(idName);
                        if (online) {
                            await context.showMessage({
                                en: 'Device is online',
                                de: 'Das Gerät ist online',
                                ru: 'Устройство в сети',
                                pt: 'O dispositivo está online',
                                nl: 'Apparaat is online',
                                fr: "L'appareil est en ligne",
                                it: 'Il dispositivo è online',
                                es: 'El dispositivo está en línea',
                                pl: 'Urządzenie jest online',
                                uk: 'Пристрій онлайн',
                                'zh-cn': '设备在线',
                            });
                        }
                        else {
                            await context.showMessage({
                                en: 'Device is offline',
                                de: 'Das Gerät ist offline',
                                ru: 'Устройство не в сети',
                                pt: 'O dispositivo está offline',
                                nl: 'Apparaat is offline',
                                fr: "L'appareil est hors ligne",
                                it: 'Il dispositivo è offline',
                                es: 'El dispositivo está fuera de línea',
                                pl: 'Urządzenie jest offline',
                                uk: 'Пристрій офлайн',
                                'zh-cn': '设备离线',
                            });
                        }
                        return { refresh: 'devices' };
                    },
                },
            ];
            // Add Wake-on-LAN action if MAC address is known
            const mac = task?.mac;
            if (mac) {
                actions.push({
                    id: 'wol',
                    icon: 'play',
                    description: {
                        en: 'Wake on LAN',
                        de: 'Wake on LAN',
                        ru: 'Wake on LAN',
                        pt: 'Wake on LAN',
                        nl: 'Wake on LAN',
                        fr: 'Wake on LAN',
                        it: 'Wake on LAN',
                        es: 'Wake on LAN',
                        pl: 'Wake on LAN',
                        uk: 'Wake on LAN',
                        'zh-cn': 'Wake on LAN',
                    },
                    handler: async (_id, context) => {
                        await this.adapter.sendWoLForDevice(idName);
                        await context.showMessage({
                            en: `Wake-on-LAN packet sent to ${mac}`,
                            de: `Wake-on-LAN-Paket an ${mac} gesendet`,
                            ru: `Пакет Wake-on-LAN отправлен на ${mac}`,
                            pt: `Pacote Wake-on-LAN enviado para ${mac}`,
                            nl: `Wake-on-LAN-pakket verzonden naar ${mac}`,
                            fr: `Paquet Wake-on-LAN envoyé à ${mac}`,
                            it: `Pacchetto Wake-on-LAN inviato a ${mac}`,
                            es: `Paquete Wake-on-LAN enviado a ${mac}`,
                            pl: `Pakiet Wake-on-LAN wysłany do ${mac}`,
                            uk: `Пакет Wake-on-LAN надіслано на ${mac}`,
                            'zh-cn': `Wake-on-LAN 数据包已发送到 ${mac}`,
                        });
                        return { refresh: 'none' };
                    },
                });
            }
            const deviceInfo = {
                id: idName,
                name: name || host,
                identifier: host,
                model: mac || '',
                status: {
                    connection: isConnected ? 'connected' : 'disconnected',
                },
                hasDetails: false,
                actions,
                backgroundColor: isConnected ? 'green' : 'red',
            };
            context.addDevice(deviceInfo);
        }
    }
}
exports.default = PingDeviceManagement;
//# sourceMappingURL=DeviceManagement.js.map