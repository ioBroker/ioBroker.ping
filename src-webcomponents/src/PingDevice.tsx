/**
 * One device of the ping adapter as a web component: `<iob-ping-device>` - the web component of the devices widget
 * "Ping Device" (`src-devices/src/PingIpAddressComponent.tsx`).
 *
 * One module for every host - vis-2, devices, Aura, admin (`@iobroker/web-components`). Its manifest is a file of
 * its own (`ping-device.json`, written by the build from `manifest.ts`), so a host loads this module only when it
 * shows the element. The host sets `socket` and `settings`, and if it has them `theme` and `editMode`.
 *
 * The setting `device` is a state of the device, or an alias of it. The element subscribes to its `alive` state
 * and, with extended information, to `time`; the name and the address come from the configuration of the instance
 * (`system.adapter.ping.<n>`), kept up to date. A click copies the address, as in the devices widget.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import type { CSSProperties, JSX, KeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { defineWebComponent, IobWebComponent } from '@iobroker/web-components/element';

import { DEVICE_TAG, type DeviceSettings } from './constants';
import { Hint } from './Hint';
import { getWord, type WordKey } from './i18n';
import {
    findPingDevice,
    getInstanceObjectId,
    getInstanceOfId,
    getPingDevices,
    getAliasTarget,
    guessAliveId,
    isAliasId,
    type PingDevice,
} from './pingDevices';
import { DEVICE_STYLES } from './styles';

/** How long the check mark stays after the address was copied */
const COPIED_MS = 1500;

/** The states of the device a setting names */
interface Target {
    aliveId: string;
    timeId: string | null;
    /** The state the value of `alive` is read from: the alias if the setting is one of `aliveId`, else `aliveId` */
    valueId: string;
    /** From the configuration of the instance; null while it is not read or does not have the device */
    device: PingDevice | null;
}

interface DeviceViewProps {
    /** Shown above the address, empty for none */
    name: string;
    /** Empty for none */
    ip: string;
    /** null while the state has no value */
    alive: boolean | null;
    /** null for none */
    timeMs: number | null;
    copied: boolean;
    editMode: boolean;
    word: (key: WordKey) => string;
    onCopy: () => void;
}

function DeviceView(props: DeviceViewProps): JSX.Element {
    const { name, ip, alive, timeMs, copied, editMode, word, onCopy } = props;
    const clickable = !!ip && !editMode;
    const state = alive === null ? 'unknown' : alive ? 'online' : 'offline';
    const classes = ['device'];
    if (clickable) {
        classes.push('clickable');
    }
    if (editMode) {
        classes.push('edit');
    }

    return (
        <div
            className={classes.join(' ')}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? word('copyIp') : undefined}
            onClick={clickable ? onCopy : undefined}
            onKeyDown={
                clickable
                    ? (e: KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onCopy();
                          }
                      }
                    : undefined
            }
        >
            {name ? <div className="name">{name}</div> : null}
            {ip ? (
                // the font size follows the length of the address, see `.ip` in styles.ts
                <div
                    className="ip"
                    style={{ '--chars': ip.length + (copied ? 2 : 0) } as CSSProperties}
                >
                    <span>{ip}</span>
                    {copied ? <span className="copied">✓</span> : null}
                </div>
            ) : null}
            <div className="status">
                <span className={`pill ${state}`}>{word(state)}</span>
                {alive && timeMs !== null ? <span className="time">{`${timeMs} ${word('ms')}`}</span> : null}
            </div>
        </div>
    );
}

class PingDeviceElement extends IobWebComponent<DeviceSettings> {
    readonly #root: Root;

    #copied = false;

    #copiedTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = DEVICE_STYLES;
        const mount = document.createElement('div');
        mount.className = 'mount';
        shadow.append(style, mount);
        this.#root = createRoot(mount);
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this.#copiedTimer) {
            clearTimeout(this.#copiedTimer);
            this.#copiedTimer = null;
        }
        this.#copied = false;
    }

    /**
     * The configuration of the instance of the device: its name and its address. For an alias first the alias, to
     * learn its target - the base class asks again once it is read
     */
    protected override getObjectIds(settings: DeviceSettings): string[] {
        const id = settings.device?.trim();
        const ids = isAliasId(id) ? [id] : [];
        const target = this.#getTarget(settings);
        const instance = target ? getInstanceOfId(target.aliveId) : null;
        if (instance) {
            ids.push(getInstanceObjectId(instance));
        }
        return ids;
    }

    protected override getStateIds(settings: DeviceSettings): string[] {
        const target = this.#getTarget(settings);
        if (!target) {
            return [];
        }
        return target.timeId && settings.showResponseTime !== false
            ? [target.valueId, target.timeId]
            : [target.valueId];
    }

    /**
     * The states of the device: from the configuration of the instance once it is read, guessed from the ID
     * before - `.time` and `.rps` of an extended device lead to its `.alive`. An alias stands for its target.
     *
     * @returns undefined while the alias is read, null if the setting names no state of the ping adapter
     */
    #getTarget(settings: DeviceSettings): Target | null | undefined {
        const picked = settings.device?.trim();
        const alias = isAliasId(picked) ? picked : null;
        const aliasObj = alias ? this.objects[alias] : null;
        if (aliasObj === undefined) {
            return undefined;
        }
        const id = alias ? getAliasTarget(aliasObj) : picked;
        const instance = getInstanceOfId(id);
        if (!id || !instance) {
            return null;
        }
        const device = findPingDevice(getPingDevices(this.objects[getInstanceObjectId(instance)]), id);
        const aliveId = device ? device.aliveId : guessAliveId(id);
        // the value through the alias, so that its conversion applies; `time` has no alias of its own
        const valueId = alias && id === aliveId ? alias : aliveId;
        if (device) {
            return { aliveId, timeId: device.timeId, valueId, device };
        }
        return {
            aliveId,
            timeId: aliveId.endsWith('.alive') ? aliveId.replace(/\.alive$/, '.time') : null,
            valueId,
            device: null,
        };
    }

    #copy(ip: string): void {
        if (this.editMode || !ip) {
            return;
        }
        // the clipboard needs a secure context (https or localhost); without one nothing happens
        navigator.clipboard
            ?.writeText(ip)
            .then(() => {
                if (this.#copiedTimer) {
                    clearTimeout(this.#copiedTimer);
                }
                this.#copied = true;
                this.render();
                this.#copiedTimer = setTimeout(() => {
                    this.#copiedTimer = null;
                    this.#copied = false;
                    this.render();
                }, COPIED_MS);
            })
            .catch(() => undefined);
    }

    protected override render(): void {
        const settings = this.settings;
        const lang = this.systemLang;
        const word = (key: WordKey): string => getWord(lang, key);

        if (!settings.device) {
            this.#root.render(
                <Hint
                    text={word('chooseDevice')}
                    editMode={this.editMode}
                />,
            );
            return;
        }

        const target = this.#getTarget(settings);
        if (target === undefined) {
            // the alias is read: no hint for a moment
            this.#root.render(null);
            return;
        }
        // the object of the ping state, not of an alias of it
        const aliveObj = target ? this.objects[target.aliveId] : null;
        // `undefined` while it is read: no hint for a moment. The alive state carries the address in `native.host`
        const isDevice =
            !!target &&
            (aliveObj === undefined ||
                (aliveObj?.type === 'state' &&
                    (aliveObj.common.role === 'indicator.reachable' || !!aliveObj.native?.host)));
        if (!target || !isDevice) {
            this.#root.render(
                <Hint
                    text={word('notDevice')}
                    editMode={this.editMode}
                />,
            );
            return;
        }

        const aliveState = this.states[target.valueId];
        const timeState = target.timeId ? this.states[target.timeId] : null;
        const ip = target.device?.ip || String(aliveObj?.native?.host || '');
        const name = settings.name?.trim() || target.device?.name || '';
        const showName = settings.showName !== false;
        // the name only if it says more than the address
        const shownName = showName && name && name !== ip ? name : '';
        // the address is hidden only in favor of a name
        const shownIp = settings.hideIp === true && shownName ? '' : ip;
        const seconds = timeState?.val;
        const timeMs =
            settings.showResponseTime !== false &&
            seconds !== null &&
            seconds !== undefined &&
            seconds !== '' &&
            Number.isFinite(Number(seconds))
                ? Math.round(Number(seconds) * 1000)
                : null;

        this.#root.render(
            <DeviceView
                name={shownName}
                ip={shownIp}
                alive={aliveState?.val === null || aliveState?.val === undefined ? null : !!aliveState.val}
                timeMs={timeMs}
                copied={this.#copied}
                editMode={this.editMode}
                word={word}
                onCopy={() => this.#copy(ip)}
            />,
        );
    }
}

defineWebComponent(DEVICE_TAG, PingDeviceElement);
