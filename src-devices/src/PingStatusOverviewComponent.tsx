// Ping Status Overview widget — at-a-glance view of every configured ping device.
//
// Compact tile: shows two numbers, "online / offline", plus a thin segmented bar that
// visualises the ratio. Clicking the tile opens a dialog with one mini-tile per device.
// Each mini-tile uses the device's own `common.icon` and `common.color` (set by the user
// in admin or device-manager) so the overview matches the rest of the user's UI, and
// gets a green/red status edge plus a "since <timestamp>" line that reads from the
// alive state's `lc` (last-change) timestamp — i.e. how long the device has been in its
// current state.
//
// Discovery: enumerates all states under the configured ping instance whose role is
// `indicator.reachable`. That captures both extended-info devices (where the alive state
// lives at `<channel>.alive`) and simple-mode devices (where the alive state IS the
// channel id) without having to special-case them. Each device's parent object (channel
// for extended, host-device for simple) is read for icon/color/name metadata.

import WidgetGeneric, {
    React,
    MuiMaterial,
    getTileStyles,
    isNeumorphicTheme,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type {
    BoxProps,
    TypographyProps,
    DialogProps,
    DialogContentProps,
    DialogTitleProps,
    IconButtonProps,
} from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/json-config';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogTitle: React.ComponentType<DialogTitleProps> = MuiMaterial?.DialogTitle;
const DialogContent: React.ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;

interface PingStatusOverviewSettings extends CustomWidgetPlugin {
    /** ping adapter instance, e.g. "ping.0". */
    instance?: string;
    /** Hide devices whose `common.enabled === false` (admin manually disabled). */
    hideDisabled?: boolean;
}

interface DeviceEntry {
    /** Full alive state id — what we subscribe to. */
    aliveId: string;
    /** Display name (from `common.name`, falls back to host). */
    name: string;
    /** IP / hostname (from the alive state's `native.host`). */
    host: string | null;
    /** User-set icon (data URL or icon path), or null when not configured. */
    icon: string | null;
    /** User-set accent color, or null. */
    color: string | null;
    /** Latest alive value — null until the first sample arrives. */
    alive: boolean | null;
    /**
     * Wall-clock timestamp of the last *state change* (`lc`). When alive=true, this is
     *  when the device came online; when alive=false, when it went offline. We render
     *  this as "online since X" / "offline since X" in the dialog.
     */
    lastChange: number | null;
}

interface PingStatusOverviewState extends WidgetGenericState {
    devices: Map<string, DeviceEntry>;
    dialogOpen: boolean;
    /**
     * Wall-clock timestamp updated periodically while the dialog is open, so the
     *  "since X" labels stay current (e.g. switching from "1 min ago" to "2 min ago").
     *  Only ticks while the dialog is mounted, to avoid waking the tab on every minute.
     */
    nowTick: number;
}

const COLORS = {
    online: '#1f8a3a',
    offline: '#b22d2d',
    unknown: '#6c7a86',
    barTrack: 'rgba(255,255,255,0.10)',
    dialogBg: '#11161b',
    tileBg: '#1c232a',
    tileBgActive: '#1d2a23',
    tileBgInactive: '#2a1d1d',
    border: 'rgba(255,255,255,0.08)',
} as const;

/** Format an absolute ms timestamp as a short, locale-aware "ago" hint. */
function formatRelative(ts: number, now: number): string {
    const ageS = Math.max(0, Math.round((now - ts) / 1000));
    if (ageS < 5) {
        return 'just now';
    }
    if (ageS < 60) {
        return `${ageS} s ago`;
    }
    const ageM = Math.round(ageS / 60);
    if (ageM < 60) {
        return `${ageM} min ago`;
    }
    const ageH = Math.round(ageM / 60);
    if (ageH < 24) {
        return `${ageH} h ago`;
    }
    const ageD = Math.round(ageH / 24);
    if (ageD < 30) {
        return `${ageD} d ago`;
    }
    // Old enough that an absolute date is more informative than "47 d ago".
    try {
        return new Date(ts).toLocaleDateString();
    } catch {
        return new Date(ts).toISOString().slice(0, 10);
    }
}

/**
 * The same lightweight i18n strategy as PingIpAddressComponent — read from the host's global
 * I18n if exposed, otherwise fall back to the English literal. Keeps the widget decoupled
 * from the host bridge's exact contents.
 */
function tr(key: string, fallback: string): string {
    const i18n = (globalThis as any)?.I18n;
    if (i18n && typeof i18n.t === 'function') {
        const v = i18n.t(key);
        if (v && v !== key) {
            return v;
        }
    }
    return fallback;
}

/**
 * Resolve `common.name` (which can be a string or a per-language object) to a single
 * display string. Mirrors the pattern used elsewhere in this codebase.
 */
function pickName(name: unknown, fallback: string): string {
    if (typeof name === 'string' && name.trim()) {
        return name.trim();
    }
    if (name && typeof name === 'object') {
        const map = name as Record<string, string>;
        // Prefer the host's language when surfaced by the dm-widgets bridge; otherwise
        // English; otherwise the first available translation.
        const hostLang = (globalThis as any)?.systemLang as string | undefined;
        if (hostLang && typeof map[hostLang] === 'string') {
            return map[hostLang];
        }
        if (typeof map.en === 'string') {
            return map.en;
        }
        const first = Object.values(map).find(v => typeof v === 'string' && v.trim());
        if (typeof first === 'string') {
            return first;
        }
    }
    return fallback;
}

export class PingStatusOverviewComponent extends WidgetGeneric<PingStatusOverviewState, PingStatusOverviewSettings> {
    private subscribed = new Map<string, (id: string, state: ioBroker.State | null | undefined) => void>();
    /** rAF-coalesced timer for the "since" relative-time refresh while the dialog is open. */
    private nowTickInterval: ReturnType<typeof setInterval> | null = null;

    constructor(props: WidgetGenericProps<PingStatusOverviewSettings>) {
        super(props);
        this.state = {
            ...this.state,
            devices: new Map(),
            dialogOpen: false,
            nowTick: Date.now(),
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        return {
            name: 'PingStatusOverview',
            schema: {
                type: 'panel',
                items: {
                    instance: {
                        type: 'instance',
                        adapter: 'ping',
                        label: 'pingstat_instance',
                        default: 'ping.0',
                        sm: 12,
                    },
                    hideDisabled: {
                        type: 'checkbox',
                        label: 'pingstat_hideDisabled',
                        default: false,
                        sm: 12,
                    },
                },
            },
        };
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        void this.discoverAndSubscribe();
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<PingStatusOverviewSettings>>,
        prevState: Readonly<PingStatusOverviewState>,
    ): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (prevProps.settings.instance !== this.props.settings.instance) {
            this.unsubscribeAll();
            this.setState({ devices: new Map() });
            void this.discoverAndSubscribe();
        }
        // Start/stop the relative-time ticker in lockstep with the dialog. Outside the
        // dialog the "since X" label isn't visible, so a 30 s timer would just be wasted
        // wake-ups in the host's idle tab.
        if (prevState.dialogOpen !== this.state.dialogOpen) {
            if (this.state.dialogOpen) {
                this.startNowTicker();
            } else {
                this.stopNowTicker();
            }
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeAll();
        this.stopNowTicker();
    }

    private startNowTicker(): void {
        if (this.nowTickInterval) {
            return;
        }
        // 30 s is enough granularity for "X min ago" / "X h ago" labels and keeps the
        // host's wake-rate negligible. The ticker only runs while the dialog is open.
        this.nowTickInterval = setInterval(() => this.setState({ nowTick: Date.now() }), 30_000);
    }

    private stopNowTicker(): void {
        if (this.nowTickInterval) {
            clearInterval(this.nowTickInterval);
            this.nowTickInterval = null;
        }
    }

    /**
     * Walk the object tree under the configured instance, find every state with role
     * `indicator.reachable` (i.e. an alive boolean produced by the ping adapter), and
     * subscribe to it. Concurrently fetches the parent object for each so we can
     * surface its icon / color / name in the dialog.
     *
     * The friendly name is taken from `system.adapter.<instance>.native.devices[i].name`
     * — that is the user-typed name from the ping adapter config dialog, the canonical
     * source of truth. The channel object's `common.name` is auto-generated by the
     * adapter (often equal to the IP) so it makes a poor display label. We fall back
     * to the channel name and finally to the host/IP itself if the adapter config
     * cannot be read.
     */
    private async discoverAndSubscribe(): Promise<void> {
        const instance = this.props.settings.instance || 'ping.0';
        const ctx = this.props.stateContext;
        const socket = ctx.getSocket();
        let allObjects: Record<string, ioBroker.Object> | null = null;
        try {
            allObjects = (await (socket as any).getObjects?.()) ?? null;
        } catch {
            return;
        }
        if (!allObjects) {
            return;
        }
        // Read the adapter-instance object to grab the user-configured device list.
        // It carries `native.devices[]` with the IP and the human-typed name. Build a
        // host→config map so we can look up names without scanning the array per state.
        // Index by both raw and trimmed IP so casual whitespace differences don't make
        // the lookup miss.
        const adapterCfg = allObjects[`system.adapter.${instance}`] as
            | (ioBroker.AdapterObject & {
                  native?: { devices?: Array<{ ip?: string; name?: string; enabled?: boolean }> };
              })
            | undefined;
        const cfgByHost = new Map<string, { name?: string; enabled?: boolean }>();
        for (const d of adapterCfg?.native?.devices ?? []) {
            const ip = (d.ip ?? '').trim();
            if (ip) {
                cfgByHost.set(ip, { name: d.name?.trim(), enabled: d.enabled });
            }
        }

        const prefix = `${instance}.`;
        const aliveStates = Object.entries(allObjects).filter(
            ([id, obj]) =>
                id.startsWith(prefix) &&
                obj?.type === 'state' &&
                (obj.common as ioBroker.StateCommon | undefined)?.role === 'indicator.reachable',
        );

        const newDevices = new Map<string, DeviceEntry>(this.state.devices);
        for (const [id, obj] of aliveStates) {
            const stateCommon = (obj.common ?? {}) as ioBroker.StateCommon;
            const native = (obj.native ?? {}) as { host?: string };
            // Find the parent object that carries presentation metadata. In extended
            // mode the parent is the channel ("ping.0.host.<id>"); in simple mode the
            // parent is the host device ("ping.0.host"). Either way, common.icon /
            // common.color may be present (set by the user via admin); we fall back to
            // the alive state's own common when not.
            const parentId = id.split('.').slice(0, -1).join('.');
            const parentObj = allObjects[parentId];
            const parentCommon = (parentObj?.common ?? {}) as ioBroker.StateCommon & { enabled: boolean };
            // Look up the user-typed name from the adapter config (preferred), falling
            // back to the parent channel's auto-generated name, and finally to the IP
            // when nothing else is available.
            const cfg = native.host ? cfgByHost.get(native.host) : undefined;
            const name = cfg?.name
                ? cfg.name
                : pickName(parentCommon.name ?? stateCommon.name, native.host ?? id.split('.').pop() ?? id);
            const icon =
                (typeof parentCommon.icon === 'string' && parentCommon.icon) ||
                (typeof stateCommon.icon === 'string' && stateCommon.icon) ||
                null;
            const color =
                (typeof parentCommon.color === 'string' && parentCommon.color) ||
                (typeof stateCommon.color === 'string' && stateCommon.color) ||
                null;
            // Skip devices the user has disabled in the adapter config dialog when the
            // widget setting opts in. We check the adapter-config `enabled` flag first
            // (the canonical source) and fall back to the channel's `common.enabled` so
            // we still respect the flag if the host hasn't surfaced the adapter object.
            if (this.props.settings.hideDisabled && (cfg?.enabled === false || parentCommon.enabled === false)) {
                continue;
            }
            // Preserve any already-known runtime state for this device so a re-discovery
            // (e.g. after instance change) doesn't briefly flash everything as "unknown".
            const existing = newDevices.get(id);
            newDevices.set(id, {
                aliveId: id,
                name,
                host: native.host ?? null,
                icon,
                color,
                alive: existing?.alive ?? null,
                lastChange: existing?.lastChange ?? null,
            });
            if (this.subscribed.has(id)) {
                continue;
            }
            const handler = (sid: string, state: ioBroker.State | null | undefined): void => {
                if (!state) {
                    return;
                }
                this.setState(prev => {
                    const map = new Map(prev.devices);
                    const cur = map.get(sid);
                    if (!cur) {
                        return null;
                    }
                    map.set(sid, {
                        ...cur,
                        alive: !!state.val,
                        // Prefer `lc` (last value-change) so we render "online since <when
                        // it actually came up>". `ts` updates on every poll even when the
                        // value is unchanged, which would make the timestamp jitter every
                        // few seconds for stable devices.
                        lastChange: state.lc || state.ts || Date.now(),
                    });
                    return { devices: map } as PingStatusOverviewState;
                });
            };
            ctx.getState(id, handler);
            this.subscribed.set(id, handler);
        }

        this.setState({ devices: newDevices });
    }

    private unsubscribeAll(): void {
        const ctx = this.props.stateContext;
        for (const [id, handler] of this.subscribed) {
            ctx.removeState(id, handler);
        }
        this.subscribed.clear();
    }

    /** Render the small "icon" — either the user-configured image, or a fallback dot. */
    private renderDeviceIcon(d: DeviceEntry, size: number): React.JSX.Element {
        const ringColor = d.alive === null ? COLORS.unknown : d.alive ? COLORS.online : COLORS.offline;
        if (d.icon) {
            return (
                <Box
                    sx={{
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        // Solid colored ring tells the user the device's state without
                        // having to read the chip below — useful at a glance in a dense grid.
                        border: `2px solid ${ringColor}`,
                        bgcolor: d.color ?? 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0,
                    }}
                >
                    <img
                        src={d.icon}
                        alt=""
                        style={{ width: '70%', height: '70%', objectFit: 'contain' }}
                    />
                </Box>
            );
        }
        // Fallback: a coloured disc using the device's user color (or the state ring).
        return (
            <Box
                sx={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    bgcolor: d.color ?? ringColor,
                    border: `2px solid ${ringColor}`,
                    flexShrink: 0,
                }}
            />
        );
    }

    /** Single mini-tile for a device — used in the dialog grid. */
    private renderDeviceTile(d: DeviceEntry): React.JSX.Element {
        const isAlive = d.alive === true;
        const isDead = d.alive === false;
        const ringColor = d.alive === null ? COLORS.unknown : isAlive ? COLORS.online : COLORS.offline;
        const sinceLabel = d.lastChange
            ? isAlive
                ? `${tr('pingstat_online_since', 'Online since')} ${formatRelative(d.lastChange, this.state.nowTick)}`
                : isDead
                  ? `${tr('pingstat_offline_since', 'Offline since')} ${formatRelative(d.lastChange, this.state.nowTick)}`
                  : ''
            : tr('pingstat_no_data', 'No data yet');
        return (
            <Box
                key={d.aliveId}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    p: 1.25,
                    borderRadius: 1.5,
                    minWidth: 220,
                    flex: '1 1 220px',
                    bgcolor: isAlive ? COLORS.tileBgActive : isDead ? COLORS.tileBgInactive : COLORS.tileBg,
                    // Coloured edge — full-height vertical accent on the left so the
                    // alive/dead distinction reads immediately even when the tile is
                    // viewed peripherally. Border-left is cheaper than a full coloured
                    // border for many tiles.
                    borderLeft: `4px solid ${ringColor}`,
                    boxShadow: `inset 0 0 0 1px ${COLORS.border}`,
                }}
            >
                {this.renderDeviceIcon(d, 36)}
                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight: 700,
                            // Long names → ellipsis. Avoid wrapping over the IP line.
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {d.name}
                    </Typography>
                    {d.host && d.host !== d.name ? (
                        <Typography
                            variant="caption"
                            sx={{
                                opacity: 0.7,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {d.host}
                        </Typography>
                    ) : null}
                    <Typography
                        variant="caption"
                        sx={{
                            color: ringColor,
                            fontWeight: 600,
                            mt: 0.25,
                        }}
                    >
                        {sinceLabel}
                    </Typography>
                </Box>
            </Box>
        );
    }

    /** Compact tile body — big online/offline counters + a thin ratio bar. */
    private renderSummary(compact: boolean): React.JSX.Element {
        const all = Array.from(this.state.devices.values());
        const online = all.filter(d => d.alive === true).length;
        const offline = all.filter(d => d.alive === false).length;
        const unknown = all.length - online - offline;
        // Avoid div-by-zero on first render: when no devices are known yet the bar is
        // rendered as a uniform unknown-grey track so it doesn't look broken.
        const numberSize = compact ? '1.6rem' : '2.2rem';
        const labelSize = compact ? '0.7rem' : '0.85rem';

        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    gap: compact ? 0.5 : 1,
                    px: 1,
                    py: 1,
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: compact ? 0.75 : 1.5,
                        // tabular-nums keeps the digits aligned on width-changes between
                        // 9 / 10 / 11 etc., avoiding horizontal jitter as states flip.
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography
                            component="span"
                            sx={{
                                color: COLORS.online,
                                fontSize: numberSize,
                                fontWeight: 800,
                                lineHeight: 1,
                            }}
                        >
                            {online}
                        </Typography>
                        <Typography
                            component="span"
                            sx={{
                                fontSize: labelSize,
                                opacity: 0.7,
                                textTransform: 'uppercase',
                                letterSpacing: 0.6,
                            }}
                        >
                            {tr('pingstat_online', 'Online')}
                        </Typography>
                    </Box>
                    <Typography
                        component="span"
                        sx={{ fontSize: numberSize, opacity: 0.4, fontWeight: 300, lineHeight: 1 }}
                    >
                        /
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography
                            component="span"
                            sx={{
                                color: COLORS.offline,
                                fontSize: numberSize,
                                fontWeight: 800,
                                lineHeight: 1,
                            }}
                        >
                            {offline}
                        </Typography>
                        <Typography
                            component="span"
                            sx={{
                                fontSize: labelSize,
                                opacity: 0.7,
                                textTransform: 'uppercase',
                                letterSpacing: 0.6,
                            }}
                        >
                            {tr('pingstat_offline', 'Offline')}
                        </Typography>
                    </Box>
                </Box>

                {/* Ratio bar — three contiguous segments sized proportionally. Even at
                    1 device the bar reads sensibly because the segments collapse to widths
                    of 0% (no border, no gap) when their count is 0. */}
                <Box
                    sx={{
                        display: 'flex',
                        width: '90%',
                        height: 6,
                        borderRadius: 999,
                        overflow: 'hidden',
                        bgcolor: COLORS.barTrack,
                    }}
                >
                    {online > 0 ? <Box sx={{ flex: online, bgcolor: COLORS.online }} /> : null}
                    {offline > 0 ? <Box sx={{ flex: offline, bgcolor: COLORS.offline }} /> : null}
                    {unknown > 0 ? <Box sx={{ flex: unknown, bgcolor: COLORS.unknown }} /> : null}
                </Box>

                {/* Total + (unknown) hint. Hidden when there are no devices at all, so the
                    tile doesn't read as "0 devices • 0 unknown" which is just noise. */}
                {all.length > 0 ? (
                    <Typography
                        variant="caption"
                        sx={{ opacity: 0.6 }}
                    >
                        {`${all.length} ${tr('pingstat_devices', 'devices')}${
                            unknown > 0 ? ` · ${unknown} ${tr('pingstat_unknown', 'unknown')}` : ''
                        }`}
                    </Typography>
                ) : (
                    <Typography
                        variant="caption"
                        sx={{ opacity: 0.6 }}
                    >
                        {tr('pingstat_empty', 'No ping devices configured')}
                    </Typography>
                )}
            </Box>
        );
    }

    /**
     * Order devices for the dialog grid: dead first (most actionable), then alive,
     *  then unknown — within each group, sort by name for a stable ordering.
     */
    private sortedDevices(): DeviceEntry[] {
        const groupRank = (d: DeviceEntry): number => (d.alive === false ? 0 : d.alive === true ? 1 : 2);
        return Array.from(this.state.devices.values()).sort((a, b) => {
            const ra = groupRank(a);
            const rb = groupRank(b);
            if (ra !== rb) {
                return ra - rb;
            }
            return a.name.localeCompare(b.name);
        });
    }

    private renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }
        const devices = this.sortedDevices();
        const online = devices.filter(d => d.alive === true).length;
        const offline = devices.filter(d => d.alive === false).length;
        return (
            <Dialog
                open
                onClose={() => this.setState({ dialogOpen: false })}
                maxWidth="md"
                fullWidth
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: COLORS.dialogBg,
                            color: '#e6ecf2',
                        },
                    },
                }}
            >
                <DialogTitle
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                    }}
                >
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography
                            variant="h6"
                            component="span"
                            sx={{ fontWeight: 700 }}
                        >
                            {tr('pingstat_dialog_title', 'Ping devices')}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.7 }}
                        >
                            <Box
                                component="span"
                                sx={{ color: COLORS.online, fontWeight: 700 }}
                            >
                                {online}
                            </Box>{' '}
                            {tr('pingstat_online', 'Online')}
                            {' · '}
                            <Box
                                component="span"
                                sx={{ color: COLORS.offline, fontWeight: 700 }}
                            >
                                {offline}
                            </Box>{' '}
                            {tr('pingstat_offline', 'Offline')}
                        </Typography>
                    </Box>
                    <IconButton
                        size="small"
                        onClick={() => this.setState({ dialogOpen: false })}
                        sx={{ color: '#e6ecf2' }}
                        aria-label={tr('pingstat_close', 'Close')}
                    >
                        {/* Plain × glyph instead of MuiIcons.Close so the widget doesn't
                            depend on a specific icon being part of the host MUI bridge. */}
                        <Box
                            component="span"
                            sx={{ fontSize: 20, lineHeight: 1, fontWeight: 600 }}
                        >
                            ×
                        </Box>
                    </IconButton>
                </DialogTitle>
                <DialogContent
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1.5,
                        alignContent: 'flex-start',
                        pb: 3,
                    }}
                >
                    {devices.length === 0 ? (
                        <Typography sx={{ opacity: 0.7, p: 2 }}>
                            {tr('pingstat_empty', 'No ping devices configured')}
                        </Typography>
                    ) : (
                        devices.map(d => this.renderDeviceTile(d))
                    )}
                </DialogContent>
            </Dialog>
        );
    }

    /** Active when any device is online — the host uses this to decide tile accent. */
    protected isTileActive(): boolean {
        for (const d of this.state.devices.values()) {
            if (d.alive === true) {
                return true;
            }
        }
        return false;
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
                    onClick={() => this.setState({ dialogOpen: true })}
                    sx={theme => ({
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        aspectRatio: '1',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        padding: isNeumorphicTheme(theme) ? '4px' : '6px',
                    })}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {indicators}
                    </div>
                    {this.renderSummary(true)}
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
                    onClick={() => this.setState({ dialogOpen: true })}
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        aspectRatio: '2',
                        overflow: 'hidden',
                        cursor: 'pointer',
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
                    {this.renderSummary(false)}
                </Box>
            </Box>
        );
    }

    render(): React.JSX.Element {
        const widget = super.render();
        const dialog = this.renderDialog();
        if (dialog) {
            return (
                <>
                    {widget}
                    {dialog}
                </>
            );
        }
        return widget;
    }
}

export default PingStatusOverviewComponent;
