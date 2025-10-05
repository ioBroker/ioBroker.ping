import React from 'react';

import {
    LinearProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Checkbox,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    TextField,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { I18n } from '@iobroker/adapter-react-v5';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';
import type { PingAdapterConfig } from './types';

function netMask2Count(netMask: string): number {
    // Calculate the number of available IP addresses
    const numbers = netMask.split('.').map(i => parseInt(i, 10).toString(2));
    if (numbers.length !== 4) {
        return 0;
    }
    const numOfOnes = numbers.join('').split('1').length - 1;

    return Math.pow(2, 32 - numOfOnes);
}

interface PingBrowseComponentState extends ConfigGenericState {
    alive: boolean;
    progress: number;
    interface: string;
    interfaces: { name: string; ip: string; netmask: string; rangeStart?: string; rangeLength?: string }[];
    selected: string[];
    ips: { ip: string; mac?: string; vendor?: string; ignore?: boolean }[];
    running: boolean;
    status: string;
    rangeStart: string;
    rangeLength: string;
}

export default class PingBrowseComponent extends ConfigGeneric<ConfigGenericProps, PingBrowseComponentState> {
    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            alive: false,
            progress: 0,
            interface: '',
            interfaces: [],
            selected: [],
            ips: [],
            running: false,
            status: '',
        };
    }

    async getAllInterfaces(): Promise<
        {
            name: string;
            ip: string;
            netmask: string;
            rangeStart?: string;
            rangeLength?: string;
        }[]
    > {
        const interfaces: {
            name: string;
            ip: string;
            netmask: string;
            rangeStart?: string;
            rangeLength?: string;
        }[] = [];
        // read config of ping adapter
        const config = await this.props.oContext.socket.getObject(
            `system.adapter.ping.${this.props.oContext.instance}`,
        );
        if (!config) {
            return interfaces;
        }
        const host = await this.props.oContext.socket.getObject(`system.host.${config.common.host}`);
        if (host?.native?.hardware?.networkInterfaces) {
            Object.keys(host.native.hardware.networkInterfaces).forEach(iface => {
                const ifc = host.native.hardware.networkInterfaces[iface];
                ifc?.forEach(addr => {
                    if (addr.family === 'IPv4' && !addr.internal) {
                        interfaces.push({
                            name: iface,
                            ip: addr.address,
                            netmask: addr.netmask,
                        });
                    }
                });
            });
        }

        return interfaces;
    }

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        const newState: Partial<PingBrowseComponentState> = {};

        const state = await this.props.oContext.socket.getState(
            `system.adapter.ping.${this.props.oContext.instance}.alive`,
        );
        newState.alive = !!state?.val;

        const ifaceLast = await this.props.oContext.socket.getState(
            `ping.${this.props.oContext.instance}.browse.interface`,
        );
        const progress = await this.props.oContext.socket.getState(
            `ping.${this.props.oContext.instance}.browse.progress`,
        );
        const browse = await this.props.oContext.socket.getState(`ping.${this.props.oContext.instance}.browse.running`);
        const result = await this.props.oContext.socket.getState(`ping.${this.props.oContext.instance}.browse.result`);
        const status = await this.props.oContext.socket.getState(`ping.${this.props.oContext.instance}.browse.status`);
        const rangeStart = await this.props.oContext.socket.getState(
            `ping.${this.props.oContext.instance}.browse.rangeStart`,
        );
        const rangeLength = await this.props.oContext.socket.getState(
            `ping.${this.props.oContext.instance}.browse.rangeLength`,
        );

        newState.status = (status?.val as string) || '';
        newState.progress = (progress?.val as number) || 0;
        newState.running = !!browse?.val;
        newState.rangeStart = (rangeStart?.val as string) || '';
        newState.rangeLength = (rangeLength?.val as string) || '';

        try {
            newState.ips = JSON.parse(result?.val as string) || [];
            // convert an old format to [{ip: 'address}]
            if (newState.ips?.length && typeof newState.ips[0] === 'string') {
                // @ts-expect-error convert old format
                newState.ips = newState.ips.map(ip => ({ ip }));
            }
        } catch {
            newState.ips = [];
        }

        await this.props.oContext.socket.subscribeState(
            `system.adapter.ping.${this.props.oContext.instance}.alive`,
            this.onChangedState,
        );
        await this.props.oContext.socket.subscribeState(
            `ping.${this.props.oContext.instance}.browse.*`,
            this.onChangedState,
        );
        newState.interfaces = await this.getAllInterfaces();
        if (ifaceLast?.val && newState.interfaces.find(item => item.ip === ifaceLast.val)) {
            newState.interface = ifaceLast.val as string;
        }

        this.setState(newState as PingBrowseComponentState);
    }

    browse(): void {
        const intr = this.state.interfaces.find(item => item.ip === this.state.interface);
        if (intr) {
            intr.rangeStart = this.state.rangeStart;
            intr.rangeLength = this.state.rangeLength;
            this.props.oContext.socket
                .sendTo(`ping.${this.props.oContext.instance}`, 'ping:settings:browse', intr)
                .catch(error => console.error(`Cannot ping: ${error}`));
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        this.props.oContext.socket.unsubscribeState(
            `system.adapter.ping.${this.props.oContext.instance}.alive`,
            this.onChangedState,
        );
        this.props.oContext.socket.unsubscribeState(
            `ping.${this.props.oContext.instance}.browse.*`,
            this.onChangedState,
        );
    }

    onChangedState = (id: string, state: ioBroker.State | null | undefined): void => {
        if (id.endsWith('.alive')) {
            const alive = !state?.val;
            if (alive !== this.state.alive) {
                this.setState({ alive });
            }
        } else if (id.endsWith('.progress')) {
            const progress = (state?.val as number) || 0;
            if (progress !== this.state.progress) {
                this.setState({ progress });
            }
        } else if (id.endsWith('.running')) {
            const running = !!state?.val;
            if (running !== this.state.running) {
                this.setState({ running });
            }
        } else if (id.endsWith('.result')) {
            const ips = state?.val || '[]';
            if (ips !== JSON.stringify(this.state.ips)) {
                this.setState({ ips: JSON.parse(ips as string) });
            }
        } else if (id.endsWith('.status')) {
            const status = (state?.val as string) || '';
            if (status !== this.state.status) {
                this.setState({ status });
            }
        } else if (id.endsWith('.rangeStart')) {
            const rangeStart = (state?.val as string) || '';
            if (rangeStart !== this.state.rangeStart) {
                this.setState({ rangeStart });
            }
        } else if (id.endsWith('.rangeLength')) {
            const rangeLength = (state?.val as string) || '';
            if (rangeLength !== this.state.rangeLength) {
                this.setState({ rangeLength });
            }
        } else if (id.endsWith('.interface')) {
            const iface = (state?.val as string) || '';
            if (iface && iface !== this.state.interface && this.state.interfaces.find(item => item.ip === iface)) {
                this.setState({ interface: iface });
            }
        }
    };

    renderItem(): React.JSX.Element {
        if (!this.state.interfaces) {
            return <LinearProgress />;
        }
        const config: PingAdapterConfig = this.props.data as PingAdapterConfig;

        const exists = config.devices || [];
        const selectable = this.state.ips.filter(it => !exists.find(item => item.ip === it.ip)).map(it => it.ip);
        const allSelected = selectable.length === this.state.selected.length;
        const iface = this.state.interfaces.find(item => item.ip === this.state.interface);
        let len = 0;
        if (iface) {
            len = netMask2Count(iface.netmask);
        }

        const button = (
            <Button
                style={{ marginLeft: len > 256 ? 0 : 16, whiteSpace: 'nowrap', width: 250 }}
                variant="contained"
                disabled={!this.state.alive || !this.state.interface}
                onClick={() => {
                    if (this.state.running) {
                        this.props.oContext.socket.setState(
                            `ping.${this.props.oContext.instance}.browse.running`,
                            false,
                        );
                    } else {
                        this.browse();
                    }
                }}
                startIcon={<Search />}
            >
                <span style={{ marginLeft: 8 }}>
                    {this.state.running
                        ? `${this.state.status} ${I18n.t('custom_ping_stop')}`
                        : I18n.t('custom_ping_browse')}
                </span>
            </Button>
        );

        return (
            <div
                style={{ width: '100%' }}
                className="ping_custom"
            >
                <h4>{I18n.t('custom_ping_title')}</h4>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
                    <FormControl
                        style={{ width: '100%', maxWidth: 600 }}
                        variant="standard"
                    >
                        <InputLabel>{I18n.t('custom_ping_interface')}</InputLabel>
                        <Select
                            variant="standard"
                            disabled={this.state.running}
                            value={this.state.interface}
                            onChange={e => {
                                let rangeStart = '';
                                let rangeLength = '';
                                const _iface = this.state.interfaces.find(item => item.ip === e.target.value);
                                if (_iface && netMask2Count(_iface.netmask) > 256) {
                                    // generate new ranges
                                    const parts = _iface.ip.split('.');
                                    parts[3] = '1';
                                    rangeStart = parts.join('.');
                                    rangeLength = '254';
                                }
                                this.setState({ interface: e.target.value, rangeStart, rangeLength }, async () => {
                                    await this.props.oContext.socket.setState(
                                        `ping.${this.props.oContext.instance}.browse.interface`,
                                        this.state.interface,
                                    );
                                    await this.props.oContext.socket.setState(
                                        `ping.${this.props.oContext.instance}.browse.rangeStart`,
                                        this.state.rangeStart,
                                    );
                                    await this.props.oContext.socket.setState(
                                        `ping.${this.props.oContext.instance}.browse.rangeLength`,
                                        this.state.rangeLength,
                                    );
                                });
                            }}
                        >
                            <MenuItem value="">
                                <em>{I18n.t('custom_ping_select_interface')}</em>
                            </MenuItem>
                            {this.state.interfaces.map(item => {
                                const len = netMask2Count(item.netmask);
                                return (
                                    <MenuItem
                                        key={item.ip}
                                        value={item.ip}
                                    >
                                        {`${item.name} - ${item.ip} (${len} ${I18n.t('custom_ping_ips')})`}
                                    </MenuItem>
                                );
                            })}
                        </Select>
                    </FormControl>
                    {len > 256 ? (
                        <TextField
                            variant="standard"
                            style={{ marginLeft: 8, width: 300 }}
                            label={I18n.t('custom_ping_range_begin')}
                            value={this.state.rangeStart}
                            onChange={e => {
                                this.setState({ rangeStart: e.target.value }, async () => {
                                    await this.props.oContext.socket.setState(
                                        `ping.${this.props.oContext.instance}.browse.rangeStart`,
                                        this.state.rangeStart,
                                    );
                                });
                            }}
                            disabled={this.state.running}
                        />
                    ) : null}
                    {len > 256 ? (
                        <TextField
                            variant="standard"
                            style={{ marginLeft: 8, width: 150 }}
                            label={I18n.t('custom_ping_range_length')}
                            value={this.state.rangeLength}
                            onChange={e => {
                                this.setState({ rangeLength: e.target.value }, async () => {
                                    await this.props.oContext.socket.setState(
                                        `ping.${this.props.oContext.instance}.browse.rangeLength`,
                                        this.state.rangeLength,
                                    );
                                });
                            }}
                            type="number"
                            slotProps={{ htmlInput: { min: 1, max: 254 } }}
                            disabled={this.state.running}
                        />
                    ) : null}
                    {len <= 256 ? button : null}
                </div>
                {len > 256 ? <div style={{ width: '100%', marginTop: 10 }}>{button}</div> : null}
                {this.state.running ? (
                    <LinearProgress
                        value={(this.state.progress / 255) * 100}
                        variant="determinate"
                        style={{ marginTop: 10 }}
                    />
                ) : (
                    <div style={{ height: 4, marginTop: 10 }} />
                )}
                <Button
                    variant="contained"
                    style={{ marginTop: 10, marginBottom: 10 }}
                    disabled={!this.state.selected.length}
                    onClick={() => {
                        const devices = [...config.devices];
                        this.state.selected.forEach(ip => {
                            if (!devices.find(item => item.ip === ip)) {
                                devices.push({ ip, name: ip });
                            }
                        });
                        const data: PingAdapterConfig = JSON.parse(JSON.stringify(this.props.data));
                        data.devices = devices;
                        devices.sort((a, b) => (a.ip > b.ip ? 1 : a.ip < b.ip ? -1 : 0));
                        this.props.onChange(data);
                        this.setState({ selected: [] });
                    }}
                >
                    {I18n.t('custom_ping_add')}
                </Button>
                <TableContainer
                    component={Paper}
                    style={{ width: '100%' }}
                >
                    <Table
                        style={{ width: '100%' }}
                        size="small"
                    >
                        <TableHead>
                            <TableRow
                                style={{ background: this.props.oContext.themeType === 'dark' ? '#333' : '#DDD' }}
                            >
                                <TableCell style={{ height: 55 }}>
                                    {selectable.length ? (
                                        <Checkbox
                                            title={I18n.t('custom_ping_select_all')}
                                            disabled={!selectable.length}
                                            indeterminate={!allSelected && !!this.state.selected.length}
                                            checked={allSelected}
                                            onClick={() => {
                                                if (!allSelected) {
                                                    this.setState({ selected: selectable });
                                                } else {
                                                    this.setState({ selected: [] });
                                                }
                                            }}
                                        />
                                    ) : null}
                                </TableCell>
                                <TableCell
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        height: 55,
                                    }}
                                >
                                    {I18n.t('custom_ping_ip')}
                                </TableCell>
                                <TableCell>{I18n.t('custom_ping_mac')}</TableCell>
                                <TableCell>{I18n.t('custom_ping_vendor')}</TableCell>
                                <TableCell>{I18n.t('custom_ping_ignore')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {this.state.ips.map(item => (
                                <TableRow
                                    key={item.ip}
                                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                                >
                                    <TableCell
                                        component="th"
                                        scope="row"
                                    >
                                        {!exists.find(it => it.ip === item.ip) ? (
                                            <Checkbox
                                                checked={this.state.selected.includes(item.ip)}
                                                style={{ padding: '0 8px' }}
                                                onChange={() => {
                                                    const selected = this.state.selected;
                                                    const pos = selected.indexOf(item.ip);
                                                    if (pos === -1) {
                                                        selected.push(item.ip);
                                                    } else {
                                                        selected.splice(pos, 1);
                                                    }
                                                    this.setState({ selected });
                                                }}
                                            />
                                        ) : null}
                                    </TableCell>
                                    <TableCell>{item.ip}</TableCell>
                                    <TableCell>{item.mac}</TableCell>
                                    <TableCell>{item.vendor}</TableCell>
                                    <TableCell>
                                        {!exists.find(it => it.ip === item.ip) ? (
                                            <Checkbox
                                                checked={item.ignore}
                                                style={{ padding: '0 8px' }}
                                                onChange={() => {
                                                    const ips = [...this.state.ips];
                                                    const editedItem = ips.find(it => it.ip === item.ip);
                                                    if (editedItem) {
                                                        editedItem.ignore = !editedItem.ignore;
                                                        this.setState({ ips }, () =>
                                                            this.props.oContext.socket.setState(
                                                                `ping.${this.props.oContext.instance}.browse.result`,
                                                                JSON.stringify(ips),
                                                                false,
                                                            ),
                                                        );
                                                    }
                                                }}
                                            />
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </div>
        );
    }
}
