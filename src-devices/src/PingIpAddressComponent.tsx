// Ping IP-Address widget — renders the IP of a configured ping device along with its
// current online state and (in extended mode) the latest response time.
//
// Data source: the ping adapter writes one channel per device under
//
//     ping.<instance>.<host>                       (channel)
//     ping.<instance>.<host>.alive                 (boolean — true = device responds)
//     ping.<instance>.<host>.time                  (number — seconds, only in extended mode)
//     ping.<instance>.<host>.rps                   (number — pings per second)
//
// The widget subscribes to `<channel>.alive` (and `.time` when present) and updates whenever
// the ping loop reports a state change. The configured device id is the channel id (e.g.
// "ping.0.192_168_1_1"), since that's what the user picks from the dropdown — the underlying
// state ids are derived by appending `.alive` / `.time` at runtime.
//
// The dropdown of available devices is populated server-side by the ping adapter via a
// `ping:getDevices` sendTo handler (see src/main.ts). That keeps the widget config form in
// sync with the adapter's actual configuration even if the user adds/removes devices later.

import WidgetGeneric, {
    React,
    MuiMaterial,
    getTileStyles,
    isNeumorphicTheme,
    AdapterReact,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type { BoxProps, TypographyProps, IconButtonProps } from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/json-config';
import type { I18n as I18nType, Icon as IconType } from '@iobroker/adapter-react-v5';
import { getDeviceAliveState, getDeviceMsState, getDeviceName } from './utils';

// The same MUI bridge resolution as the other widgets — pull components from the host-shared
// `window.__iobrokerShared__` via `@iobroker/dm-widgets` rather than direct `@mui/material`
// imports, so this widget shares the host's React/MUI instances. We deliberately stick to
// the smallest set the host is guaranteed to bridge (Box / Typography / IconButton); the
// status pill is rendered as a styled Box, so we don't depend on `Chip` being in the
// bridge, and the copy button uses a Unicode glyph, so we don't depend on a specific
// MUI icon being exposed.
const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const I18n = AdapterReact.I18n as typeof I18nType;
const Icon = AdapterReact.Icon as typeof IconType;

interface PingIpAddressSettings extends CustomWidgetPlugin {
    /** ping adapter instance, e.g. "ping.0". */
    instance?: string;
    /**
     * Full state id of the device's `alive` boolean. The dropdown returned by
     * `ping:getDevices` stores this as its `value` so the widget can subscribe directly
     *  without a further lookup. In extended-info mode this looks like
     *  `ping.0.<hostName>.<idName>.alive`; in simple mode it is just
     *  `ping.0.<hostName>.<idName>` (the alive boolean lives at the channel id, no
     *  sub-state). Either way we subscribe to it as-is.
     */
    deviceId?: string;
    /** Show the device name above the IP. */
    showName?: boolean;
    /** Hide IP address. */
    hideIp?: boolean;
    /** Show the latest ping response time (only meaningful in extended-info mode). */
    showResponseTime?: boolean;
}

interface PingIpAddressState extends WidgetGenericState {
    /** State for alive status */
    stateIp: string | null;
    /** State for response time value */
    stateTime: string | null;
    /** Friendly name (channel.common.name). Falls back to the IP when empty. */
    name: string | null;
    /** Latest `.alive` state value — null until the first sample arrives. */
    alive: boolean | null;
    /** Latest `.time` state value (seconds), or null when extended mode is off. */
    responseTimeS: number | null;
    /** Wall-clock timestamp of the last alive update, used for the "last seen" hint. */
    lastUpdate: number | null;
}

const COLORS = {
    aliveBg: '#1f6f3a',
    aliveText: '#ffffff',
    deadBg: '#7a2222',
    deadText: '#ffffff',
    unknownBg: '#3a4047',
    unknownText: '#c8d0d8',
} as const;

export class PingIpAddressComponent extends WidgetGeneric<PingIpAddressState, PingIpAddressSettings> {
    private subscribedIds: Array<{
        id: string;
        handler: (id: string, state: ioBroker.State | null | undefined) => void;
    }> = [];

    constructor(props: WidgetGenericProps<PingIpAddressSettings>) {
        super(props);
        this.state = {
            ...this.state,
            stateIp: null,
            stateTime: null,
            name: null,
            alive: null,
            responseTimeS: null,
            lastUpdate: null,
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        return {
            name: 'PingIpAddress',
            schema: {
                type: 'panel',
                items: {
                    instance: {
                        type: 'instance',
                        adapter: 'ping',
                        label: 'pingip_instance',
                        default: 'ping.0',
                        sm: 12,
                    },
                    deviceId: {
                        // selectSendTo asks the chosen ping instance for its device list
                        // (see ping:getDevices in src/main.ts). The result is shaped as
                        // [{ value, label }], and the user picks one.
                        type: 'selectSendTo',
                        label: 'pingip_device',
                        command: 'ping:getDevices',
                        // Re-query the list whenever the instance changes, so the dropdown
                        // matches the freshly selected adapter.
                        alsoDependsOn: ['instance'],
                        // Bind to the chosen instance — selectSendTo defaults to the first
                        // instance of the adapter, but we want to honour the user's choice.
                        instance: '${data.instance}', // re-query the device list when the instance changes
                        sm: 12,
                    },
                    showName: {
                        type: 'checkbox',
                        label: 'pingip_showName',
                        default: true,
                        sm: 6,
                    },
                    showResponseTime: {
                        type: 'checkbox',
                        label: 'pingip_showResponseTime',
                        default: true,
                        sm: 6,
                    },
                    hideIp: {
                        type: 'checkbox',
                        label: 'pingip_hideIP',
                        default: false,
                        hidden: '!data.showName',
                        sm: 6,
                    },
                    icon: {
                        type: 'component',
                        subType: 'iconSelect',
                        label: 'pingip_icon',
                        sm: 6,
                    },
                    name: {
                        type: 'text',
                        label: 'pingip_name',
                        hidden: '!data.showName',
                        sm: 12,
                    },
                },
            },
        };
    }

    async componentDidMount(): Promise<void> {
        super.componentDidMount?.();
        const result = await this.loadDeviceMetadata();
        this.subscribeStates(result);
    }

    componentDidUpdate(prevProps: Readonly<WidgetGenericProps<PingIpAddressSettings>>): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (
            prevProps.settings.instance !== this.props.settings.instance ||
            prevProps.settings.deviceId !== this.props.settings.deviceId
        ) {
            this.unsubscribeStates();
            this.setState({
                stateIp: null,
                stateTime: null,
                name: null,
                alive: null,
                responseTimeS: null,
                lastUpdate: null,
            });
            void this.loadDeviceMetadata();
            this.subscribeStates();
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeStates();
    }

    /**
     * Read the device's metadata once on mount. The ping adapter writes the original
     * (un-sanitised) IP into `native.host` of the alive state itself, and the friendly
     * name lives in `common.name`. We use those rather than trying to reverse the
     * sanitised id, because the id replaces dots with underscores AND would also rewrite
     * a ":port" suffix to "_port" — making the round-trip ambiguous for TCP-port checks.
     */
    private async loadDeviceMetadata(): Promise<{ stateIp: string | null; stateTime: string | null }> {
        const deviceId = this.props.settings.deviceId;
        if (!deviceId) {
            return { stateIp: null, stateTime: null };
        }
        try {
            const instanceObj = await this.props.stateContext.getObject<ioBroker.InstanceObject>(
                `system.adapter.${this.props.settings.instance || 'ping.0'}`,
            );
            if (!instanceObj) {
                return { stateIp: null, stateTime: null };
            }
            const stateIp = getDeviceAliveState(instanceObj, deviceId);
            const stateTime = getDeviceMsState(instanceObj, deviceId);
            // — that's a state-naming convention, not a display label we want to show as-is.
            this.setState({
                stateIp,
                stateTime,
                name: getDeviceName(instanceObj, deviceId),
            });
            return { stateIp, stateTime };
        } catch {
            // Ignore — the IP/name will simply stay at their defaults. Subscriptions still
            // run, so alive/time can still update.
        }
        return { stateIp: null, stateTime: null };
    }

    private subscribeStates(result?: { stateIp: string | null; stateTime: string | null }): void {
        const stateIp = result?.stateIp || this.state.stateIp;
        if (!stateIp) {
            return;
        }
        const ctx = this.props.stateContext;

        const aliveHandler = (_id: string, state: ioBroker.State | null | undefined): void => {
            if (state) {
                this.setState({ alive: !!state.val, lastUpdate: state.ts || Date.now() });
            }
        };
        ctx.getState(stateIp, aliveHandler);
        this.subscribedIds.push({ id: stateIp, handler: aliveHandler });
        const stateTime = result?.stateTime || this.state.stateTime;
        const showResponseTime = this.props.settings.showResponseTime !== false;

        if (stateTime && showResponseTime) {
            const timeHandler = (_id: string, state: ioBroker.State | null | undefined): void => {
                if (state && state.val != null) {
                    this.setState({ responseTimeS: Number(state.val) });
                }
            };
            ctx.getState(stateTime, timeHandler);
            this.subscribedIds.push({ id: stateTime, handler: timeHandler });
        }
    }

    private unsubscribeStates(): void {
        const ctx = this.props.stateContext;
        for (const { id, handler } of this.subscribedIds) {
            ctx.removeState(id, handler);
        }
        this.subscribedIds = [];
    }

    /** Active = alive is currently true (drives the host's "active" tile styling). */
    protected isTileActive(): boolean {
        return this.state.alive === true;
    }

    private async copyIpToClipboard(): Promise<void> {
        const ip = this.props.settings.deviceId;
        if (!ip) {
            return;
        }
        try {
            await navigator.clipboard?.writeText(ip);
        } catch {
            // Clipboard API requires a secure context — silently ignore in the rare case
            // the host is served over plain HTTP. The chip click still gives feedback.
        }
    }

    /** Status pill (Online / Offline / Unknown) shown next to the IP. */
    private renderStatusChip(compact: boolean): React.JSX.Element {
        const { alive } = this.state;
        let label: string;
        let bg: string;
        let color: string;
        if (alive === null) {
            label = I18n.t('pingip_unknown');
            bg = COLORS.unknownBg;
            color = COLORS.unknownText;
        } else if (alive) {
            label = I18n.t('pingip_online');
            bg = COLORS.aliveBg;
            color = COLORS.aliveText;
        } else {
            label = I18n.t('pingip_offline');
            bg = COLORS.deadBg;
            color = COLORS.deadText;
        }
        return (
            <Box
                component="span"
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    bgcolor: bg,
                    color,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    fontSize: compact ? '0.72rem' : '0.85rem',
                    px: compact ? 0.85 : 1.2,
                    py: compact ? 0.2 : 0.35,
                    borderRadius: 999,
                    textTransform: 'uppercase',
                    lineHeight: 1.4,
                }}
            >
                {label}
            </Box>
        );
    }
    protected renderTileIcon(): React.JSX.Element | null {
        const { alive } = this.state;

        // Active: iconActive, fallback to icon (with active color); Inactive: icon only
        const customIcon = alive
            ? this.props.settings?.iconActive || this.props.settings?.icon
            : this.props.settings?.icon;
        if (!customIcon) {
            return null;
        }
        return (
            <Icon
                src={customIcon}
                style={{
                    width: '40%',
                    height: '40%',
                    transition: 'color 0.25s ease',
                }}
            />
        );
    }

    /** Body of the tile — name, IP, status, optional response time. Used by both layouts. */
    private renderBody(compact: boolean): React.JSX.Element {
        const { name, alive, responseTimeS } = this.state;
        const strName = this.props.settings.name || name;
        const showName = this.props.settings.showName !== false;
        const hideIp = this.props.settings.hideIp === true && showName;
        const showResponseTime = this.props.settings.showResponseTime !== false;
        // Display the friendly name only when distinct from the IP — when a user just typed
        // the IP as the name, repeating it adds visual noise without information.
        const displayName = showName && strName && strName !== this.props.settings.deviceId ? strName : null;
        const ipLabel = this.props.settings.deviceId ?? I18n.t('pingip_no_device');
        // ms is more intuitive than seconds at sub-second response times — convert with one
        // decimal so 0.0123 s renders as "12 ms" instead of "0.012 s".
        const timeMs = responseTimeS != null && isFinite(responseTimeS) ? Math.round(responseTimeS * 1000) : null;

        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    gap: compact ? 0.5 : 1,
                    overflow: 'hidden',
                    px: 1,
                    py: 1,
                }}
                onClick={e => {
                    e.stopPropagation();
                    void this.copyIpToClipboard();
                }}
            >
                {this.renderTileIcon()}
                {displayName ? (
                    <Typography
                        variant={compact ? 'caption' : 'body2'}
                        sx={{
                            fontWeight: 600,
                            opacity: 0.9,
                            textAlign: 'center',
                            // Names can be long (e.g. "Hue Bridge — Living Room") — clip to one
                            // line with an ellipsis instead of wrapping over the IP below.
                            maxWidth: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {displayName}
                    </Typography>
                ) : null}

                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        // The IP gets the visual weight — large, monospace, hard-line-break
                        // resistant. Click-to-copy is mounted on the icon button next to it.
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    }}
                >
                    {!hideIp || !this.props.settings.deviceId ? (
                        <Typography
                            component="span"
                            sx={{
                                fontSize: compact ? '1.1rem' : '1.35rem',
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                // Keep the dotted IP atomic — no breaks even on narrow tiles.
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {ipLabel}
                        </Typography>
                    ) : null}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {this.renderStatusChip(compact)}
                    {showResponseTime && alive && timeMs != null ? (
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}
                        >
                            {`${timeMs} ${I18n.t('pingip_ms')}`}
                        </Typography>
                    ) : null}
                </Box>
            </Box>
        );
    }

    renderCompact(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleCompact(theme)}
            >
                <Box
                    sx={theme => ({
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        aspectRatio: '1',
                        overflow: 'hidden',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        padding: isNeumorphicTheme(theme) ? '4px' : '6px',
                    })}
                >
                    {/* Plain wrapper so clicks on the indicator/settings icons don't bubble
                        up and trigger the parent tile's gestures. */}
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {indicators}
                    </div>
                    {this.renderBody(true)}
                </Box>
            </Box>
        );
    }

    renderWideTall(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const settingsButton = this.renderSettingsButton();
        const indicators = this.renderIndicators(settingsButton);
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleWideTall(theme)}
            >
                <Box
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        aspectRatio: '2',
                        overflow: 'hidden',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        padding: isNeumorphicTheme(theme) ? '8px' : '12px',
                    })}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {indicators}
                    </div>
                    {this.renderBody(false)}
                </Box>
            </Box>
        );
    }
}

export default PingIpAddressComponent;
