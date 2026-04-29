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
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type { BoxProps, TypographyProps, IconButtonProps } from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/json-config';

// Same MUI bridge resolution as the other widgets — pull components from the host-shared
// `window.__iobrokerShared__` via `@iobroker/dm-widgets` rather than direct `@mui/material`
// imports, so this widget shares the host's React/MUI instances. We deliberately stick to
// the smallest set the host is guaranteed to bridge (Box / Typography / IconButton); the
// status pill is rendered as a styled Box so we don't depend on `Chip` being in the
// bridge, and the copy button uses a Unicode glyph so we don't depend on a specific
// MUI icon being exposed.
const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;

interface PingIpAddressSettings extends CustomWidgetPlugin {
    /** ping adapter instance, e.g. "ping.0". */
    instance?: string;
    /**
     * Full state id of the device's `alive` boolean. The dropdown returned by
     * `ping:getDevices` stores this as its `value` so the widget can subscribe directly
     *  without further lookup. In extended-info mode this looks like
     *  `ping.0.<hostName>.<idName>.alive`; in simple mode it is just
     *  `ping.0.<hostName>.<idName>` (the alive boolean lives at the channel id, no
     *  sub-state). Either way we subscribe to it as-is.
     */
    deviceId?: string;
    /** Show device name above the IP. */
    showName?: boolean;
    /** Show the latest ping response time (only meaningful in extended-info mode). */
    showResponseTime?: boolean;
}

interface PingIpAddressState extends WidgetGenericState {
    /** IP address as configured for the device — pulled from the channel's `native.ip`. */
    ip: string | null;
    /** Friendly name (channel.common.name). Falls back to the IP when empty. */
    name: string | null;
    /** Latest `.alive` state value — null until first sample arrives. */
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

/**
 * Lightweight translation helper that reads from ioBroker's globally-shared `I18n` (the
 * host loads `dm-widgets/i18n/*.json` into it), falling back to the English literal
 * when the global isn't available (dev harness, host without translations, etc.).
 *
 * We don't statically import `@iobroker/adapter-react-v5`'s I18n here because it isn't
 * always part of the dm-widgets bridge, and a hard import would make the widget bundle
 * pull a duplicate copy. Reading from the window-global keeps the dependency soft.
 */
function translateStatus(key: string, fallback: string): string {
    const i18n = (globalThis as any)?.I18n;
    if (i18n && typeof i18n.t === 'function') {
        const translated = i18n.t(key);
        // I18n.t returns the key itself when no translation is registered — treat that as
        // "no translation" and fall back to the English literal.
        if (translated && translated !== key) {
            return translated;
        }
    }
    return fallback;
}

export class PingIpAddressComponent extends WidgetGeneric<PingIpAddressState, PingIpAddressSettings> {
    private subscribedIds: Array<{
        id: string;
        handler: (id: string, state: ioBroker.State | null | undefined) => void;
    }> = [];

    constructor(props: WidgetGenericProps<PingIpAddressSettings>) {
        super(props);
        this.state = {
            ...this.state,
            ip: null,
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
                        // selectSendTo asks the chosen ping instance for its devices list
                        // (see ping:getDevices in src/main.ts). The result is shaped as
                        // [{ value, label }] and the user picks one.
                        type: 'selectSendTo',
                        label: 'pingip_device',
                        command: 'ping:getDevices',
                        // Re-query the list whenever the instance changes so the dropdown
                        // matches the freshly-selected adapter.
                        alsoDependsOn: ['instance'],
                        // Bind to the chosen instance — selectSendTo defaults to the first
                        // instance of the adapter, but we want to honour the user's choice.
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
                },
            },
        };
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        void this.loadDeviceMetadata();
        this.subscribeStates();
    }

    componentDidUpdate(prevProps: Readonly<WidgetGenericProps<PingIpAddressSettings>>): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (
            prevProps.settings.instance !== this.props.settings.instance ||
            prevProps.settings.deviceId !== this.props.settings.deviceId
        ) {
            this.unsubscribeStates();
            this.setState({ ip: null, name: null, alive: null, responseTimeS: null, lastUpdate: null });
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
    private async loadDeviceMetadata(): Promise<void> {
        const deviceId = this.props.settings.deviceId;
        if (!deviceId) {
            return;
        }
        try {
            const obj = await this.props.stateContext.getObject<ioBroker.StateObject>(deviceId);
            if (!obj) {
                return;
            }
            const native = (obj.native as { host?: string } | undefined) ?? {};
            const commonName = obj.common?.name;
            // common.name can be a string or a translation object — pick the user's language
            // when it's a map, fall back to English / first available value otherwise.
            const name =
                typeof commonName === 'string'
                    ? commonName
                    : commonName && typeof commonName === 'object'
                      ? ((commonName as Record<string, string>).en ?? Object.values(commonName as object)[0] ?? null)
                      : null;
            // Strip the "Alive " prefix the adapter prepends when both name and host are set
            // — that's a state-naming convention, not a display label we want to show as-is.
            const cleanedName = typeof name === 'string' ? name.replace(/^Alive\s+/i, '') : null;
            this.setState({
                ip: native.host ?? null,
                name: cleanedName,
            });
        } catch {
            // Ignore — the IP/name will simply stay at their defaults. Subscriptions still
            // run, so alive/time can still update.
        }
    }

    /**
     * Derive the response-time state id from the alive state id. In extended-info mode the
     * alive id ends with `.alive`, and the sibling `.time` lives next to it. In simple
     * mode the alive id has no suffix and there's no time state — return null so we skip
     * the subscription cleanly.
     */
    private deriveTimeId(aliveId: string): string | null {
        if (aliveId.endsWith('.alive')) {
            return `${aliveId.slice(0, -'.alive'.length)}.time`;
        }
        return null;
    }

    private subscribeStates(): void {
        const aliveId = this.props.settings.deviceId;
        if (!aliveId) {
            return;
        }
        const ctx = this.props.stateContext;

        const aliveHandler = (_id: string, state: ioBroker.State | null | undefined): void => {
            if (state) {
                this.setState({ alive: !!state.val, lastUpdate: state.ts || Date.now() });
            }
        };
        ctx.getState(aliveId, aliveHandler);
        this.subscribedIds.push({ id: aliveId, handler: aliveHandler });

        const timeId = this.deriveTimeId(aliveId);
        if (timeId) {
            const timeHandler = (_id: string, state: ioBroker.State | null | undefined): void => {
                if (state && state.val != null) {
                    this.setState({ responseTimeS: Number(state.val) });
                }
            };
            ctx.getState(timeId, timeHandler);
            this.subscribedIds.push({ id: timeId, handler: timeHandler });
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
        const ip = this.state.ip;
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
            label = translateStatus('pingip_unknown', '—');
            bg = COLORS.unknownBg;
            color = COLORS.unknownText;
        } else if (alive) {
            label = translateStatus('pingip_online', 'Online');
            bg = COLORS.aliveBg;
            color = COLORS.aliveText;
        } else {
            label = translateStatus('pingip_offline', 'Offline');
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

    /** Body of the tile — name, IP, status, optional response time. Used by both layouts. */
    private renderBody(compact: boolean): React.JSX.Element {
        const { ip, name, alive, responseTimeS } = this.state;
        const showName = this.props.settings.showName !== false;
        const showResponseTime = this.props.settings.showResponseTime !== false;
        // Display the friendly name only when distinct from the IP — when a user just typed
        // the IP as the name, repeating it adds visual noise without information.
        const displayName = showName && name && name !== ip ? name : null;
        const ipLabel = ip ?? translateStatus('pingip_no_device', 'No device');
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
            >
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
                    {ip ? (
                        <IconButton
                            size="small"
                            onClick={e => {
                                e.stopPropagation();
                                void this.copyIpToClipboard();
                            }}
                            sx={{
                                opacity: 0.55,
                                '&:hover': { opacity: 1 },
                                fontSize: compact ? '0.85rem' : '1rem',
                            }}
                            title={translateStatus('pingip_copy', 'Copy')}
                        >
                            {/* Unicode "two squares" glyph — readable across platform fonts and
                                doesn't depend on a specific MUI icon being part of the host
                                bridge (the icon set the host exposes via window.__iobrokerShared__
                                doesn't always include ContentCopy). */}
                            <span aria-hidden>⧉</span>
                        </IconButton>
                    ) : null}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {this.renderStatusChip(compact)}
                    {showResponseTime && alive && timeMs != null ? (
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}
                        >
                            {`${timeMs} ms`}
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
