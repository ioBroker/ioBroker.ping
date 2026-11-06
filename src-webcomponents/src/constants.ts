/**
 * The web components of the ping adapter. Each one is built on its own (`vite build --mode <name>`, see
 * `vite.config.ts`), so that each is ONE module file: a host imports exactly one URL per component.
 */

/** Name of a component: the mode of its build and the base name of its files */
export type ComponentName = 'ping-device' | 'ping-overview';

export const COMPONENT_NAMES: ComponentName[] = ['ping-device', 'ping-overview'];

/** Tag of `<iob-ping-device>`: one device - its IP address, whether it answers and its response time */
export const DEVICE_TAG = 'iob-ping-device';

/** Tag of `<iob-ping-overview>`: how many devices of an instance answer, all of them in a dialog */
export const OVERVIEW_TAG = 'iob-ping-overview';

/** The built module, next to its manifest */
export function getModuleFile(name: ComponentName): string {
    return `${name}.js`;
}

/** The manifest the build writes next to the module; `common.webComponents` names this one */
export function getManifestFile(name: ComponentName): string {
    return `${name}.json`;
}

/** Where `tasks.js` puts the module in the admin folder; the React import is relative to it */
export function getModulePath(name: ComponentName): string {
    return `webcomponents/${getModuleFile(name)}`;
}

/** The values of the settings of `<iob-ping-device>`; a setting without a value is missing */
export type DeviceSettings = {
    /** A state of the device: `ping.0.<host>.<ip>` or `ping.0.<host>.<name>.alive` (or `.time`, `.rps`) */
    device?: string;
    showName?: boolean;
    /** Instead of the name of the device in the configuration of the instance */
    name?: string;
    hideIp?: boolean;
    showResponseTime?: boolean;
};

/** The values of the settings of `<iob-ping-overview>`; a setting without a value is missing */
export type OverviewSettings = {
    /** e.g. `ping.0` */
    instance?: string;
    hideDisabled?: boolean;
};
