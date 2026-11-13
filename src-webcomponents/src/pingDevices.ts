/**
 * The devices of a ping instance and the IDs of their states - from the configuration of the instance, the same
 * way the adapter makes them (`prepareObjectsByConfig()` and `prepareObjectsForHost()` in `src/main.ts`):
 *
 * - simple:   `ping.0.<host>.<id>`, the state itself is `alive`
 * - extended: `ping.0.<host>.<id>.alive`, `.time` (seconds) and `.rps`
 *
 * `<host>` is left out with `noHostname`; `<id>` is the IP address, or the name with `use_name`. If the adapter
 * changes how it builds the IDs, this file has to follow.
 *
 * Pure logic, no DOM and no React: the elements and the smoke test use it alike.
 */
import type { DeviceConfig, PingAdapterConfig } from '../../src/types';

/** The same as `FORBIDDEN_CHARS` of `src/main.ts` */
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;

/** One configured device */
export interface PingDevice {
    /** The address as configured: an IP, a host name, or `host:port` for a TCP check */
    ip: string;
    /** The name of the configuration, empty if there is none */
    name: string;
    /** A disabled device has no states: the adapter neither pings it nor creates its objects */
    enabled: boolean;
    /** The boolean state: true if the device answers */
    aliveId: string;
    /** The response time in seconds, only with extended information */
    timeId: string | null;
}

/**
 * The instance an ID of a ping state belongs to
 *
 * @param id e.g. `ping.0.server.192_168_1_1`
 * @returns `ping.0`, or null if the ID is not one of the ping adapter
 */
export function getInstanceOfId(id: string | undefined | null): string | null {
    const match = id?.match(/^(ping\.\d+)\./);
    return match ? match[1] : null;
}

/**
 * Whether an ID is one of an alias
 *
 * @param id e.g. `alias.0.server.alive`
 */
export function isAliasId(id: string | undefined | null): id is string {
    return !!id?.startsWith('alias.');
}

/**
 * The state an alias points to: `common.alias.id`, or its `read` if the alias reads and writes different states
 *
 * @param aliasObj the object of the alias
 * @returns the ID of the target, or null if the alias has none
 */
export function getAliasTarget(aliasObj: ioBroker.Object | null | undefined): string | null {
    const id = (aliasObj?.common as Partial<ioBroker.StateCommon> | undefined)?.alias?.id;
    if (typeof id === 'string') {
        return id || null;
    }
    return id?.read || null;
}

/**
 * The ID of the object of an instance
 *
 * @param instance e.g. `ping.0`, or already `system.adapter.ping.0`
 */
export function getInstanceObjectId(instance: string): string {
    return instance.startsWith('system.adapter.') ? instance : `system.adapter.${instance}`;
}

function toIdPart(text: string): string {
    return text
        .replace(FORBIDDEN_CHARS, '_')
        .replace(/[.\s]+/g, '_')
        .replace(/:/g, '_');
}

function getDevice(namespace: string, hostDevice: string, config: DeviceConfig): PingDevice {
    const host = (config.ip || '').trim();
    const name = (config.name || '').trim();
    const idName = toIdPart(config.use_name ? name || host : host);
    const base = `${namespace}${hostDevice ? `.${hostDevice}` : ''}.${idName}`;
    return {
        ip: host,
        name,
        enabled: config.enabled !== false,
        aliveId: config.extended_info ? `${base}.alive` : base,
        timeId: config.extended_info ? `${base}.time` : null,
    };
}

/**
 * The configured devices of an instance, in the order of its configuration
 *
 * @param instanceObj the object `system.adapter.ping.<n>`
 */
export function getPingDevices(instanceObj: ioBroker.Object | null | undefined): PingDevice[] {
    if (instanceObj?.type !== 'instance') {
        return [];
    }
    const native = instanceObj.native as Partial<PingAdapterConfig> | undefined;
    const namespace = instanceObj._id.replace(/^system\.adapter\./, '');
    // the adapter takes the name of the host it runs on, which is the host of the instance
    const hostName = instanceObj.common.host || '';
    const hostDevice = native?.noHostname ? '' : hostName.replace(FORBIDDEN_CHARS, '_').replace(/[.\s]+/g, '_');
    return (Array.isArray(native?.devices) ? native.devices : [])
        .filter(device => device?.ip?.trim())
        .map(device => getDevice(namespace, hostDevice, device));
}

/**
 * The device a state belongs to - its `alive`, `time` or `rps` state
 *
 * @param devices the devices of the instance
 * @param id the ID of one of its states
 */
export function findPingDevice(devices: PingDevice[], id: string): PingDevice | null {
    return (
        devices.find(
            device =>
                device.aliveId === id ||
                device.timeId === id ||
                (device.timeId !== null && device.timeId.replace(/\.time$/, '.rps') === id),
        ) || null
    );
}

/**
 * The `alive` state for an ID the user picked, before the configuration of the instance is known: `.time` and
 * `.rps` of an extended device are siblings of `.alive`
 *
 * @param id the picked ID
 */
export function guessAliveId(id: string): string {
    return id.replace(/\.(time|rps)$/, '.alive');
}
