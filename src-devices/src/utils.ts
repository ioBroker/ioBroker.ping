const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;
import type { PingAdapterConfig } from '../../src/types';

export function getDeviceAliveState(instanceObj: ioBroker.InstanceObject, deviceId: string): string | null {
    const config = instanceObj.native as PingAdapterConfig;
    const device = config.devices?.find(d => d.ip === deviceId);
    if (!device) {
        return null;
    }
    const name = device.extended_info
        ? device.name
              .replace(FORBIDDEN_CHARS, '_')
              .replace(/[.\s]+/g, '_')
              .replace(/:/g, '_')
        : '';
    const ipStr = device.ip
        .replace(FORBIDDEN_CHARS, '_')
        .replace(/[.\s]+/g, '_')
        .replace(/:/g, '_');
    if (device.extended_info) {
        return `${instanceObj._id.replace('system.adapter.', '')}.${config.noHostname ? '' : `${instanceObj.common.host}.`}${device.extended_info ? `${device.use_name ? name : ipStr}.alive` : ipStr}`;
    }
    return `${instanceObj._id.replace('system.adapter.', '')}.${config.noHostname ? '' : `${instanceObj.common.host}.`}${device.use_name ? name : ipStr}`;
}

export function getDeviceName(instanceObj: ioBroker.InstanceObject, deviceId: string): string | null {
    const config = instanceObj.native as PingAdapterConfig;
    const device = config.devices?.find(d => d.ip === deviceId);
    return device?.name || null;
}

export function getDeviceMsState(instanceObj: ioBroker.InstanceObject, deviceId: string): string | null {
    const config = instanceObj.native as PingAdapterConfig;
    const device = config.devices?.find(d => d.ip === deviceId);
    if (!device) {
        return null;
    }
    const name = device.extended_info
        ? device.name
              .replace(FORBIDDEN_CHARS, '_')
              .replace(/[.\s]+/g, '_')
              .replace(/:/g, '_')
        : '';
    const ipStr = device.ip
        .replace(FORBIDDEN_CHARS, '_')
        .replace(/[.\s]+/g, '_')
        .replace(/:/g, '_');

    if (device.extended_info) {
        return `${instanceObj._id.replace('system.adapter.', '')}.${config.noHostname ? '' : `${instanceObj.common.host}.`}${device.extended_info ? `${device.use_name ? name : ipStr}.time` : ipStr}`;
    }
    return null;
}
