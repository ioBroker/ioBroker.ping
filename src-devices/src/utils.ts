/**
 * The state IDs of a configured ping device, built from the configuration of the instance the same way the adapter
 * builds them (`prepareObjectsByConfig()` and `prepareObjectsForHost()` in `src/main.ts`, also mirrored by
 * `src-webcomponents/src/pingDevices.ts`):
 *
 * - simple:   `ping.0.<host>.<id>`, the state itself is `alive`
 * - extended: `ping.0.<host>.<id>.alive`, `.time` (seconds) and `.rps`
 *
 * `<host>` is the sanitised host of the instance, left out with `noHostname`; `<id>` is the trimmed IP address, or
 * with `use_name` the trimmed name (the IP if the name is empty). A disabled device has no states. If the adapter
 * changes how it builds the IDs, this file has to follow.
 */
import type { DeviceConfig, PingAdapterConfig } from '../../src/types';

/** The same as `FORBIDDEN_CHARS` of `src/main.ts` */
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;

/** The configured device with this address that has states: the adapter creates none for a disabled one */
function findEnabledDevice(instanceObj: ioBroker.InstanceObject, deviceId: string): DeviceConfig | null {
    if (!deviceId?.trim()) {
        return null;
    }
    const config = instanceObj.native as PingAdapterConfig;
    return config.devices?.find(d => d.ip === deviceId && d.enabled !== false) || null;
}

/** The ID of the channel (extended information) or of the state (simple) of a device */
function getDeviceBaseId(instanceObj: ioBroker.InstanceObject, device: DeviceConfig): string {
    const config = instanceObj.native as PingAdapterConfig;
    const host = (device.ip || '').trim();
    const name = (device.name || '').trim();
    const idName = (device.use_name ? name || host : host)
        .replace(FORBIDDEN_CHARS, '_')
        .replace(/[.\s]+/g, '_')
        .replace(/:/g, '_');
    // the adapter takes the name of the host it runs on, which is the host of the instance
    const hostName = instanceObj.common.host || '';
    const hostDevice = config.noHostname ? '' : hostName.replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_');
    const namespace = instanceObj._id.replace(/^system\.adapter\./, '');
    return `${namespace}${hostDevice ? `.${hostDevice}` : ''}.${idName}`;
}

export function getDeviceAliveState(instanceObj: ioBroker.InstanceObject, deviceId: string): string | null {
    const device = findEnabledDevice(instanceObj, deviceId);
    if (!device) {
        return null;
    }
    const baseId = getDeviceBaseId(instanceObj, device);
    return device.extended_info ? `${baseId}.alive` : baseId;
}

export function getDeviceName(instanceObj: ioBroker.InstanceObject, deviceId: string): string | null {
    const config = instanceObj.native as PingAdapterConfig;
    const device = config.devices?.find(d => d.ip === deviceId);
    return device?.name || null;
}

/** The response time in seconds - only devices with extended information have it */
export function getDeviceMsState(instanceObj: ioBroker.InstanceObject, deviceId: string): string | null {
    const device = findEnabledDevice(instanceObj, deviceId);
    if (!device?.extended_info) {
        return null;
    }
    return `${getDeviceBaseId(instanceObj, device)}.time`;
}
