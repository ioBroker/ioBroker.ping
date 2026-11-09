/**
 * All devices of a ping instance at a glance as a web component: `<iob-ping-overview>` - the web component of the
 * devices widget "Ping Overview" (`src-devices/src/PingStatusOverviewComponent.tsx`).
 *
 * One module for every host - vis-2, devices, Aura, admin (`@iobroker/web-components`). Its manifest is a file of
 * its own (`ping-overview.json`, written by the build from `manifest.ts`), so a host loads this module only when it
 * shows the element. The host sets `socket` and `settings`, and if it has them `theme`, `editMode` and `dialogs`.
 *
 * The devices come from the configuration of the instance (`system.adapter.ping.<n>`), kept up to date; the
 * element subscribes to their `alive` states. The tile counts the devices that answer and those that do not; a
 * click shows all of them in an element dialog that the host frames, with since when each one is so.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import type { JSX, KeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { defineWebComponent, getThemeCssVariables, IobWebComponent } from '@iobroker/web-components/element';

import { OVERVIEW_TAG, type OverviewSettings } from './constants';
import { Hint } from './Hint';
import { getWord, type WordKey } from './i18n';
import { getInstanceObjectId, getPingDevices, type PingDevice } from './pingDevices';
import { DIALOG_STYLES, OVERVIEW_STYLES } from './styles';
import { formatSince } from './time';

/** How often "since 5 minutes" is computed again while the dialog is open */
const TICK_MS = 30_000;

/** A device with its state */
interface DeviceEntry extends PingDevice {
    /** null while its state has no value, and for a disabled device */
    alive: boolean | null;
    /** When the value last changed (`lc`), in ms; null without a value */
    lastChange: number | null;
}

interface Counts {
    online: number;
    offline: number;
    unknown: number;
}

function count(entries: DeviceEntry[]): Counts {
    const online = entries.filter(entry => entry.alive === true).length;
    const offline = entries.filter(entry => entry.alive === false).length;
    return { online, offline, unknown: entries.length - online - offline };
}

/** For the dialog: the devices that do not answer first, then those that do, then the unknown - each by name */
function sortEntries(entries: DeviceEntry[]): DeviceEntry[] {
    const rank = (entry: DeviceEntry): number => (entry.alive === false ? 0 : entry.alive === true ? 1 : 2);
    return [...entries].sort(
        (a, b) => rank(a) - rank(b) || (a.name || a.ip).localeCompare(b.name || b.ip, undefined, { numeric: true }),
    );
}

interface SummaryProps {
    entries: DeviceEntry[];
    /** The configuration of the instance is still read */
    loading: boolean;
    editMode: boolean;
    word: (key: WordKey) => string;
    onOpen: () => void;
}

/** The tile: online / offline, a bar with the ratio, and how many devices there are */
function Summary({ entries, loading, editMode, word, onOpen }: SummaryProps): JSX.Element {
    const { online, offline, unknown } = count(entries);
    const clickable = !editMode && !loading;
    const classes = ['overview'];
    if (clickable) {
        classes.push('clickable');
    }
    if (editMode) {
        classes.push('edit');
    }
    let total = ' ';
    if (!loading) {
        total = entries.length
            ? `${entries.length} ${word('devices')}${unknown ? ` · ${unknown} ${word('unknownCount')}` : ''}`
            : word('empty');
    }

    return (
        <div
            className={classes.join(' ')}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? word('dialogTitle') : undefined}
            onClick={clickable ? onOpen : undefined}
            onKeyDown={
                clickable
                    ? (e: KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onOpen();
                          }
                      }
                    : undefined
            }
        >
            <div className="counts">
                <div className="count online">
                    <span className="number">{online}</span>
                    <span className="label">{word('online')}</span>
                </div>
                <span className="slash">/</span>
                <div className="count offline">
                    <span className="number">{offline}</span>
                    <span className="label">{word('offline')}</span>
                </div>
            </div>
            <div className="bar">
                {online ? (
                    <span
                        className="online"
                        style={{ flex: online }}
                    />
                ) : null}
                {offline ? (
                    <span
                        className="offline"
                        style={{ flex: offline }}
                    />
                ) : null}
                {unknown ? (
                    <span
                        className="unknown"
                        style={{ flex: unknown }}
                    />
                ) : null}
            </div>
            <div className="total">{total}</div>
        </div>
    );
}

interface DeviceListProps {
    entries: DeviceEntry[];
    now: number;
    lang: string;
    word: (key: WordKey) => string;
}

/** The content of the dialog: one tile per device */
function DeviceList({ entries, now, lang, word }: DeviceListProps): JSX.Element {
    const { online, offline } = count(entries);
    return (
        <div className="list">
            <div className="summary">
                <b className="online">{online}</b> {word('online')} · <b className="offline">{offline}</b>{' '}
                {word('offline')}
            </div>
            {entries.length ? (
                <div className="grid">
                    {sortEntries(entries).map(entry => {
                        const state = entry.alive === null ? 'unknown' : entry.alive ? 'online' : 'offline';
                        let since = word('noData');
                        if (!entry.enabled) {
                            since = word('disabled');
                        } else if (entry.alive !== null && entry.lastChange) {
                            since = entry.alive
                                ? `${word('onlineSince')} ${formatSince(entry.lastChange, now, lang, false)}`
                                : `${word('offlineSince')} ${formatSince(entry.lastChange, now, lang, true)}`;
                        }
                        return (
                            <div
                                key={entry.aliveId}
                                className={`tile ${state}`}
                            >
                                <span className="dot" />
                                <div className="info">
                                    <span className="name">{entry.name || entry.ip}</span>
                                    {entry.name && entry.name !== entry.ip ? (
                                        <span className="ip">{entry.ip}</span>
                                    ) : null}
                                    <span className="since">{since}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="empty">{word('empty')}</div>
            )}
        </div>
    );
}

class PingOverviewElement extends IobWebComponent<OverviewSettings> {
    readonly #root: Root;

    /** Draws the open dialog again; null while none is open */
    #drawDialog: (() => void) | null = null;

    #ticker: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = OVERVIEW_STYLES;
        const mount = document.createElement('div');
        mount.className = 'mount';
        shadow.append(style, mount);
        this.#root = createRoot(mount);
    }

    override connectedCallback(): void {
        super.connectedCallback();
        if (this.#drawDialog) {
            this.#startTicker();
        }
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        this.#stopTicker();
    }

    /** The configuration of the instance: which devices there are */
    protected override getObjectIds(settings: OverviewSettings): string[] {
        return settings.instance ? [getInstanceObjectId(settings.instance)] : [];
    }

    /** Disabled devices have no states */
    protected override getStateIds(settings: OverviewSettings): string[] {
        return this.#getDevices(settings)
            .filter(device => device.enabled)
            .map(device => device.aliveId);
    }

    #getDevices(settings: OverviewSettings): PingDevice[] {
        if (!settings.instance) {
            return [];
        }
        const devices = getPingDevices(this.objects[getInstanceObjectId(settings.instance)]);
        return settings.hideDisabled ? devices.filter(device => device.enabled) : devices;
    }

    #getEntries(): DeviceEntry[] {
        return this.#getDevices(this.settings).map(device => {
            const state = device.enabled ? this.states[device.aliveId] : null;
            const hasValue = state?.val !== null && state?.val !== undefined;
            return {
                ...device,
                alive: hasValue ? !!state.val : null,
                // `lc`: since when it is so; `ts` changes with every ping
                lastChange: hasValue ? state.lc || state.ts || null : null,
            };
        });
    }

    #startTicker(): void {
        this.#ticker ||= setInterval(() => this.#drawDialog?.(), TICK_MS);
    }

    #stopTicker(): void {
        if (this.#ticker) {
            clearInterval(this.#ticker);
            this.#ticker = null;
        }
    }

    #onOpen = (): void => {
        if (!this.editMode && !this.#drawDialog) {
            void this.#openDialog();
        }
    };

    /** All devices in an element dialog of the host, drawn again with every change of a state */
    async #openDialog(): Promise<void> {
        const lang = this.systemLang;
        const word = (key: WordKey): string => getWord(lang, key);
        const element = document.createElement('div');
        // the host moves the content into its dialog, out of this element: it takes the theme along
        for (const [name, value] of Object.entries(getThemeCssVariables(this.theme))) {
            element.style.setProperty(name, value);
        }
        const shadow = element.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = DIALOG_STYLES;
        const mount = document.createElement('div');
        shadow.append(style, mount);
        const root = createRoot(mount);
        this.#drawDialog = () =>
            root.render(
                <DeviceList
                    entries={this.#getEntries()}
                    now={Date.now()}
                    lang={lang}
                    word={word}
                />,
            );
        this.#drawDialog();
        this.#startTicker();
        try {
            await this.openDialog({ title: word('dialogTitle'), element, width: 900 });
        } finally {
            this.#stopTicker();
            this.#drawDialog = null;
            root.unmount();
        }
    }

    protected override render(): void {
        const settings = this.settings;
        const lang = this.systemLang;
        const word = (key: WordKey): string => getWord(lang, key);

        if (!settings.instance) {
            this.#root.render(
                <Hint
                    text={word('chooseInstance')}
                    editMode={this.editMode}
                />,
            );
        } else {
            const instanceObj = this.objects[getInstanceObjectId(settings.instance)];
            if (instanceObj === null) {
                this.#root.render(
                    <Hint
                        text={`${word('noInstance')}: ${settings.instance}`}
                        editMode={this.editMode}
                    />,
                );
            } else {
                this.#root.render(
                    <Summary
                        entries={this.#getEntries()}
                        loading={instanceObj === undefined}
                        editMode={this.editMode}
                        word={word}
                        onOpen={this.#onOpen}
                    />,
                );
            }
        }
        this.#drawDialog?.();
    }
}

defineWebComponent(OVERVIEW_TAG, PingOverviewElement);
