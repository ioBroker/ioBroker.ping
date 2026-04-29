// Live dev harness — opens a real socket.io connection to the ioBroker admin at
// localhost:8081, wires a minimal StateContext, and renders the ping widget so the
// settings panel + state subscriptions can be tested against actual ping adapter data.
//
// NOT part of the production bundle. Only loaded by src/index.tsx (Vite dev server).

import React, { useEffect, useState } from 'react';
import { Connection } from '@iobroker/adapter-react-v5';
import type { IStateContext, StateChangeListener, ObjectChangeListener } from '@iobroker/dm-widgets';
import PingIpAddressComponent from './PingIpAddressComponent';
import PingStatusOverviewComponent from './PingStatusOverviewComponent';

const IOB_HOST = 'localhost';
const IOB_PORT = 8081;
const DEFAULT_INSTANCE = 'ping.0';

const overlayStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#191c1d',
    color: '#d8dde0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 18,
};

/**
 * Minimal IStateContext implementation that routes getState/removeState to a real
 * `@iobroker/socket-client` Connection. Fan-out per ID is handled locally so the
 * same state can have multiple subscribers (widget instance + dev UI for example).
 */
class DevStateContext implements IStateContext {
    private handlers = new Map<string, Set<StateChangeListener>>();
    private readonly socket: Connection;

    defaultHistory: string | null = null;
    instanceId = '';
    admin = false;
    language: ioBroker.Languages = 'en';
    longitude: number | null = null;
    latitude: number | null = null;
    isFloatComma = true;
    dateFormat = 'DD.MM.YYYY';
    imagePrefix = '../../files/';

    constructor(socket: Connection) {
        this.socket = socket;
    }

    getState(id: string, handler: StateChangeListener): void {
        let set = this.handlers.get(id);
        if (!set) {
            set = new Set();
            this.handlers.set(id, set);
            void this.socket.subscribeState(id, (sid, state) => {
                const listeners = this.handlers.get(sid);
                if (!listeners || !state) {
                    return;
                }
                for (const cb of listeners) {
                    cb(sid, state);
                }
            });
            void this.socket
                .getState(id)
                .then(state => {
                    if (state) {
                        handler(id, state);
                    }
                })
                .catch(() => {});
        }
        set.add(handler);
    }

    removeState(id: string, handler: StateChangeListener): void {
        const set = this.handlers.get(id);
        if (!set) {
            return;
        }
        set.delete(handler);
        if (set.size === 0) {
            this.socket.unsubscribeState(id);
            this.handlers.delete(id);
        }
    }

    async getObject<T>(id: string): Promise<T | undefined> {
        try {
            return (await this.socket.getObject(id)) as unknown as T;
        } catch {
            return undefined;
        }
    }

    getObjectProperty(_id: string, _property: string, _cb: ObjectChangeListener): void {}
    async removeObject(_id: string, _cb: ObjectChangeListener): Promise<void> {}

    getSocket(): Connection {
        return this.socket;
    }

    destroy(): void {
        for (const id of this.handlers.keys()) {
            this.socket.unsubscribeState(id);
        }
        this.handlers.clear();
    }
}

/**
 * Dev subclass — the real WidgetGeneric is provided by the host via Module Federation and is
 * stubbed in the installed dm-widgets package, so `render()` returns null when the widget is
 * loaded standalone. Use the production renderCompact directly so we exercise the same code
 * path the host would.
 */
class DevPingIp extends PingIpAddressComponent {
    override render(): React.JSX.Element {
        return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 280 }}>{this.renderCompact()}</div>
            </div>
        );
    }
}

/**
 * Dev subclass for the overview — also renders the dialog when open, since the production
 * `render()` is stubbed in the dev dm-widgets shim.
 */
class DevPingStatus extends PingStatusOverviewComponent {
    override render(): React.JSX.Element {
        return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 280 }}>{this.renderCompact()}</div>
                {(this as any).renderDialog?.()}
            </div>
        );
    }
}

type ConnState = 'connecting' | 'ready' | { error: string };

export default function App(): React.JSX.Element {
    const [ctx, setCtx] = useState<DevStateContext | null>(null);
    const [conn, setConn] = useState<ConnState>('connecting');
    const [deviceId, setDeviceId] = useState<string>('');
    const [devices, setDevices] = useState<{ value: string; label: string }[]>([]);
    const [activeTab, setActiveTab] = useState<'ip' | 'overview'>('ip');

    useEffect(() => {
        let socket: Connection | null = null;
        try {
            socket = new Connection({
                host: IOB_HOST,
                port: IOB_PORT,
                protocol: 'http:',
                name: 'ping-dev-harness',
                admin5only: true,
                onReady: () => {
                    setCtx(new DevStateContext(socket!));
                    setConn('ready');
                    // Pull the ping adapter's device list for the dev picker via the same
                    // sendTo command the production widget config uses.
                    socket
                        ?.sendTo(DEFAULT_INSTANCE, 'ping:getDevices', null)
                        .then((res: any) => {
                            if (Array.isArray(res)) {
                                setDevices(res);
                                if (res.length && !deviceId) {
                                    setDeviceId(res[0].value);
                                }
                            }
                        })
                        .catch((err: unknown) => {
                            // eslint-disable-next-line no-console
                            console.warn('ping:getDevices failed', err);
                        });
                },
                onError: (err: Error) => setConn({ error: String(err?.message || err) }),
            } as any);
        } catch (err) {
            setConn({ error: String(err) });
        }
        return () => {
            try {
                socket?.destroy?.();
            } catch {
                // ignore
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (conn === 'connecting') {
        return <div style={overlayStyle}>Connecting to {`http://${IOB_HOST}:${IOB_PORT}`} …</div>;
    }
    if (typeof conn === 'object' && 'error' in conn) {
        return <div style={{ ...overlayStyle, color: '#ff6b6b' }}>Connection error: {conn.error}</div>;
    }
    if (!ctx) {
        return <div style={overlayStyle}>Initializing state context …</div>;
    }

    const widget = {
        id: 'dev-ping-ip',
        type: 'widget' as const,
        name: 'ping-ip',
        control: {
            states: [],
            type: 'unknown',
            storeId: '',
            parentId: '',
            deviceId: '',
            channelId: '',
        },
    };

    const settings = {
        size: '1x1' as const,
        name: 'Ping',
        favorite: false,
        color: '',
        chartHours: 0,
        icon: '',
        iconActive: '',
        text: '',
        textActive: '',
        instance: DEFAULT_INSTANCE,
        deviceId,
        showName: true,
        showResponseTime: true,
    };

    const overviewSettings = {
        size: '1x1' as const,
        name: 'Status',
        favorite: false,
        color: '',
        chartHours: 0,
        icon: '',
        iconActive: '',
        text: '',
        textActive: '',
        instance: DEFAULT_INSTANCE,
        hideDisabled: false,
    };

    const tabButtonStyle = (active: boolean): React.CSSProperties => ({
        padding: '6px 14px',
        borderRadius: 6,
        border: `1px solid ${active ? '#4a9eff' : '#3a3f43'}`,
        background: active ? '#1b3a5c' : '#0b0f14',
        color: active ? '#ffffff' : '#d8dde0',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
    });

    return (
        <div
            style={{ minHeight: '100vh', background: '#191c1d', color: '#d8dde0', fontFamily: 'system-ui, sans-serif' }}
        >
            <div
                style={{
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    borderBottom: '1px solid #2a2f33',
                }}
            >
                <button
                    type="button"
                    style={tabButtonStyle(activeTab === 'ip')}
                    onClick={() => setActiveTab('ip')}
                >
                    IP address
                </button>
                <button
                    type="button"
                    style={tabButtonStyle(activeTab === 'overview')}
                    onClick={() => setActiveTab('overview')}
                >
                    Status overview
                </button>
                {activeTab === 'ip' ? (
                    <>
                        <span style={{ marginLeft: 16 }}>Ping device:</span>
                        <select
                            value={deviceId}
                            onChange={e => setDeviceId(e.target.value)}
                            style={{
                                padding: 6,
                                background: '#0b0f14',
                                color: '#d8dde0',
                                border: '1px solid #3a3f43',
                            }}
                        >
                            {devices.length === 0 ? <option value="">— no devices —</option> : null}
                            {devices.map(d => (
                                <option
                                    key={d.value}
                                    value={d.value}
                                >
                                    {d.label}
                                </option>
                            ))}
                        </select>
                    </>
                ) : null}
                <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 13 }}>
                    connected to {IOB_HOST}:{IOB_PORT}
                </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                {activeTab === 'ip' ? (
                    deviceId ? (
                        <DevPingIp
                            // Force a remount on device change so the subscribe/unsubscribe cycle
                            // runs cleanly without needing extra plumbing in componentDidUpdate.
                            key={deviceId}
                            widget={widget as any}
                            stateContext={ctx as any}
                            settings={settings as any}
                            onHide={() => {}}
                        />
                    ) : (
                        <div style={overlayStyle}>
                            No ping device configured — add one in the ping adapter settings.
                        </div>
                    )
                ) : (
                    <DevPingStatus
                        key="overview"
                        widget={widget as any}
                        stateContext={ctx as any}
                        settings={overviewSettings as any}
                        onHide={() => {}}
                    />
                )}
            </div>
        </div>
    );
}
