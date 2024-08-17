import React from 'react';
import PropTypes from 'prop-types';

import {
    LinearProgress, Table, TableBody,
    TableCell, TableContainer, TableHead,
    TableRow, Paper, Checkbox,
    FormControl, InputLabel, Select, MenuItem,
    Button, CircularProgress,
} from '@mui/material';
import { I18n } from '@iobroker/adapter-react-v5';
import { ConfigGeneric } from '@iobroker/json-config';

const countCharOccurrences = (string , char) => string.split(char).length - 1;

const decimalToBinary = dec => (dec >>> 0).toString(2);
const getNetMaskParts = nmask => nmask.split('.').map(Number);
const netmask2CIDR = netmask => countCharOccurrences(getNetMaskParts(netmask)
    .map(part => decimalToBinary(part))
    .join(''),
'1'
);

function netMask2Count(netmask) {
     // Calculate the number of available IP addresses
    const numbers = netmask.split('.').map(i => parseInt(i, 10).toString(2));
    if (numbers.length !== 4) {
        return 0;
    }
    const numOfOnes = numbers.join('').split('1').length - 1;

    return Math.pow(2, 32 - numOfOnes);
}

class PingBrowseComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = {
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

    async componentDidMount() {
        await super.componentDidMount();
        const newState = {};

        const state = await this.props.socket.getState(`system.adapter.ping.${this.props.instance}.alive`);
        newState.alive = !!state?.val;

        const progress = await this.props.socket.getState(`ping.${this.props.instance}.browse.progress`);
        const browse = await this.props.socket.getState(`ping.${this.props.instance}.browse.running`);
        const result = await this.props.socket.getState(`ping.${this.props.instance}.browse.result`);
        const status = await this.props.socket.getState(`ping.${this.props.instance}.browse.status`);
        newState.status = status?.val || '';
        newState.progress = progress?.val || 0;
        newState.running = !!browse?.val;
        try {
            newState.ips = JSON.parse(result?.val) || [];
        } catch {
            newState.ips = [];
        }

        await this.props.socket.subscribeState(`system.adapter.ping.${this.props.instance}.alive`, this.onChangedState);
        await this.props.socket.subscribeState(`ping.${this.props.instance}.browse.*`, this.onChangedState);
        // read config of ping adapter
        const config = await this.props.socket.getObject(`system.adapter.ping.${this.props.instance}`);
        const host = await this.props.socket.getObject(`system.host.${config.common.host}`);
        if (host?.native?.hardware?.networkInterfaces) {
            const interfaces = [];
            Object.keys(host.native.hardware.networkInterfaces).forEach(iface => {
                const ifc = host.native.hardware.networkInterfaces[iface];
                ifc.forEach(addr => {
                    if (addr.family === 'IPv4' && !addr.internal) {
                        interfaces.push({
                            name: iface,
                            ip: addr.address,
                            netmask: addr.netmask,
                        });
                    }
                });
            });
            this.setState({ interfaces });
        }
    }

    browse() {
        this.props.socket.sendTo(`ping.${this.props.instance}`, 'browse', this.state.interfaces.find(item => item.ip === this.state.interface))
            .then(result => this.setState({ ips: result?.result || [] }));
    }

    async componentWillUnmount() {
        await this.props.socket.unsubscribeState(`system.adapter.ping.${this.props.instance}.alive`, this.onChangedState);
        await this.props.socket.unsubscribeState(`ping.${this.props.instance}.browse.*`, this.onChangedState);
    }

    onChangedState = (id, state) => {
        if (id.endsWith('.alive')) {
            const alive = state ? state.val : false;
            if (alive !== this.state.alive) {
                this.setState({alive});
            }
        } else if (id.endsWith('.progress')) {
            const progress = state ? state.val : 0;
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
                this.setState({ ips: JSON.parse(ips) });
            }
        } else if (id.endsWith('.status')) {
            const status = state?.val || '';
            if (status !== this.state.status) {
                this.setState({ status });
            }
        }
    };

    renderItem() {
        if (!this.state.interfaces) {
            return <LinearProgress />;
        }

        const exists = this.props.data.devices || [];
        const selectable = this.state.ips.filter(ip => !exists.find(item => item.ip === ip));
        const allSelected = selectable.length === this.state.selected.length;

        return <div style={{ width: '100%'}} className="ping_custom">
            <h4>{I18n.t('custom_ping_title')}</h4>
            <div style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
                <FormControl style={{ width: '100%', maxWidth: 600 }} variant="standard">
                    <InputLabel>{I18n.t('custom_ping_interface')}</InputLabel>
                    <Select
                        variant="standard"
                        value={this.state.interface}
                        onChange={e => this.setState({ interface: e.target.value })}
                    >
                        <MenuItem value="">
                            <em>{I18n.t('custom_ping_select_interface')}</em>
                        </MenuItem>
                        {this.state.interfaces.map(item => {
                            const len = netMask2Count(item.netmask);
                            return <MenuItem
                                disabled={len > 4096}
                                value={item.ip}
                            >
                                {`${item.name} - ${item.ip} (${len} ${I18n.t('custom_ping_ips')})`}
                            </MenuItem>;
                        })}
                    </Select>
                </FormControl>
                <Button
                    style={{ marginLeft: 16, whiteSpace: 'nowrap' }}
                    variant="contained"
                    disabled={!this.state.alive || !this.state.interface}
                    onClick={() => {
                        if (this.state.running) {
                            this.props.socket.setState(`ping.${this.props.instance}.browse.running`, false);
                        } else {
                            this.browse();
                        }
                    }}
                >
                    {this.state.running ? <CircularProgress /> : null}
                    <span style={{ marginLeft: 8 }}>{this.state.running ? `${this.state.status} ${I18n.t('custom_ping_stop')}` : I18n.t('custom_ping_browse')}</span>
                </Button>
            </div>
            {this.state.running ? <LinearProgress
                value={this.state.progress / 255 * 100}
                variant="determinate"
            /> : <div style={{ height: 4 }} />}
            <TableContainer component={Paper} style={{ width: '100%' }}>
                <Table style={{ width: '100%' }} size="small">
                    <TableHead>
                        <TableRow style={{ background: this.props.themeType === 'dark' ? '#333' : '#DDD' }}>
                            <TableCell style={{ height: 55 }}>
                                {selectable.length ? <Checkbox
                                    title={I18n.t('custom_ping_select_all')}
                                    disabled={!this.state.alive || this.state.running}
                                    indeterminate={!allSelected && this.state.selected.length}
                                    checked={allSelected}
                                    onClick={() => {
                                        if (!allSelected) {
                                            this.setState({ selected: selectable });
                                        } else {
                                            this.setState({ selected: [] });
                                        }
                                    }}
                                /> : null}
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
                                <Button
                                    variant="contained"
                                    disabled={!this.state.selected.length}
                                    onClick={() => {
                                        const devices = [...this.props.data.devices];
                                        this.state.selected.forEach(ip => {
                                            if (!devices.find(item => item.ip === ip)) {
                                                devices.push({ ip, name: ip });
                                            }
                                        });
                                        const data = JSON.parse(JSON.stringify(this.props.data));
                                        data.devices = devices;
                                        devices.sort((a, b) => a.ip > b.ip ? 1 : (a.ip < b.ip ? -1 : 0));
                                        this.props.onChange(data);
                                        this.setState({ selected: [] });
                                    }}
                                >
                                    {I18n.t('custom_ping_add')}
                                </Button>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.state.ips.map(ip => <TableRow
                            key={ip}
                            sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                        >
                            <TableCell component="th" scope="row">
                                {!exists.find(item => item.ip === ip) ? <Checkbox
                                    checked={this.state.selected.includes(ip)}
                                    style={{
                                        padding: '0 8px',
                                    }}
                                    onChange={() => {
                                        const selected = this.state.selected;
                                        const pos = selected.indexOf(ip);
                                        if (pos === -1) {
                                            selected.push(ip);
                                        } else {
                                            selected.splice(pos, 1);
                                        }
                                        this.setState({ selected });
                                    }}
                                /> : null}
                            </TableCell>
                            <TableCell>{ip}</TableCell>
                        </TableRow>)}
                    </TableBody>
                </Table>
            </TableContainer>
        </div>;
    }
}

PingBrowseComponent.propTypes = {
    socket: PropTypes.object.isRequired,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    style: PropTypes.object,
    data: PropTypes.object.isRequired,
    attr: PropTypes.string,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
};

export default PingBrowseComponent;
