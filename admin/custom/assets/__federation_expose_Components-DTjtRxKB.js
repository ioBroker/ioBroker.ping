import { importShared } from './__federation_fn_import-6j1WaWuS.js';
import { j as jsxRuntimeExports } from './jsx-runtime-DBvYS8qm.js';

await importShared('react');

const PropTypes = await importShared('prop-types');

const {LinearProgress,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Paper,Checkbox,FormControl,InputLabel,Select,MenuItem,Button,TextField} = await importShared('@mui/material');

const {Search} = await importShared('@mui/icons-material');

const {I18n} = await importShared('@iobroker/adapter-react-v5');

const {ConfigGeneric} = await importShared('@iobroker/json-config');

function netMask2Count(netmask) {
  const numbers = netmask.split(".").map((i) => parseInt(i, 10).toString(2));
  if (numbers.length !== 4) {
    return 0;
  }
  const numOfOnes = numbers.join("").split("1").length - 1;
  return Math.pow(2, 32 - numOfOnes);
}
class PingBrowseComponent extends ConfigGeneric {
  constructor(props) {
    super(props);
    this.state = {
      alive: false,
      progress: 0,
      interface: "",
      interfaces: [],
      selected: [],
      ips: [],
      running: false,
      status: ""
    };
  }
  async getAllInterfaces() {
    const interfaces = [];
    const config = await this.props.socket.getObject(`system.adapter.ping.${this.props.instance}`);
    const host = await this.props.socket.getObject(`system.host.${config.common.host}`);
    if (host?.native?.hardware?.networkInterfaces) {
      Object.keys(host.native.hardware.networkInterfaces).forEach((iface) => {
        const ifc = host.native.hardware.networkInterfaces[iface];
        ifc.forEach((addr) => {
          if (addr.family === "IPv4" && !addr.internal) {
            interfaces.push({
              name: iface,
              ip: addr.address,
              netmask: addr.netmask
            });
          }
        });
      });
    }
    return interfaces;
  }
  async componentDidMount() {
    await super.componentDidMount();
    const newState = {};
    const state = await this.props.socket.getState(`system.adapter.ping.${this.props.instance}.alive`);
    newState.alive = !!state?.val;
    const ifaceLast = await this.props.socket.getState(`ping.${this.props.instance}.browse.interface`);
    const progress = await this.props.socket.getState(`ping.${this.props.instance}.browse.progress`);
    const browse = await this.props.socket.getState(`ping.${this.props.instance}.browse.running`);
    const result = await this.props.socket.getState(`ping.${this.props.instance}.browse.result`);
    const status = await this.props.socket.getState(`ping.${this.props.instance}.browse.status`);
    const rangeStart = await this.props.socket.getState(`ping.${this.props.instance}.browse.rangeStart`);
    const rangeLength = await this.props.socket.getState(`ping.${this.props.instance}.browse.rangeLength`);
    newState.status = status?.val || "";
    newState.progress = progress?.val || 0;
    newState.running = !!browse?.val;
    newState.rangeStart = rangeStart?.val || "";
    newState.rangeLength = rangeLength?.val || "";
    try {
      newState.ips = JSON.parse(result?.val) || [];
      if (newState.ips[0] && typeof newState.ips === "string") {
        newState.ips = newState.ips.map((ip) => ({ ip }));
      }
    } catch {
      newState.ips = [];
    }
    await this.props.socket.subscribeState(`system.adapter.ping.${this.props.instance}.alive`, this.onChangedState);
    await this.props.socket.subscribeState(`ping.${this.props.instance}.browse.*`, this.onChangedState);
    newState.interfaces = await this.getAllInterfaces();
    if (newState.interfaces.find((item) => item.ip === ifaceLast?.val)) {
      newState.interface = ifaceLast?.val;
    }
    this.setState(newState);
  }
  browse() {
    const intr = this.state.interfaces.find((item) => item.ip === this.state.interface);
    intr.rangeStart = this.state.rangeStart;
    intr.rangeLength = this.state.rangeLength;
    this.props.socket.sendTo(`ping.${this.props.instance}`, "ping:settings:browse", intr).catch((error) => console.error(`Cannot ping: ${error}`));
  }
  async componentWillUnmount() {
    await this.props.socket.unsubscribeState(`system.adapter.ping.${this.props.instance}.alive`, this.onChangedState);
    await this.props.socket.unsubscribeState(`ping.${this.props.instance}.browse.*`, this.onChangedState);
  }
  onChangedState = (id, state) => {
    if (id.endsWith(".alive")) {
      const alive = state ? state.val : false;
      if (alive !== this.state.alive) {
        this.setState({ alive });
      }
    } else if (id.endsWith(".progress")) {
      const progress = state ? state.val : 0;
      if (progress !== this.state.progress) {
        this.setState({ progress });
      }
    } else if (id.endsWith(".running")) {
      const running = !!state?.val;
      if (running !== this.state.running) {
        this.setState({ running });
      }
    } else if (id.endsWith(".result")) {
      const ips = state?.val || "[]";
      if (ips !== JSON.stringify(this.state.ips)) {
        this.setState({ ips: JSON.parse(ips) });
      }
    } else if (id.endsWith(".status")) {
      const status = state?.val || "";
      if (status !== this.state.status) {
        this.setState({ status });
      }
    } else if (id.endsWith(".rangeStart")) {
      const rangeStart = state?.val || "";
      if (rangeStart !== this.state.rangeStart) {
        this.setState({ rangeStart });
      }
    } else if (id.endsWith(".rangeLength")) {
      const rangeLength = state?.val || "";
      if (rangeLength !== this.state.rangeLength) {
        this.setState({ rangeLength });
      }
    } else if (id.endsWith(".interface")) {
      const iface = state?.val || "";
      if (iface && iface !== this.state.interface && this.state.interfaces.find((item) => item.ip === iface)) {
        this.setState({ interface: iface });
      }
    }
  };
  renderItem() {
    if (!this.state.interfaces) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(LinearProgress, {});
    }
    const exists = this.props.data.devices || [];
    const selectable = this.state.ips.filter((it) => !exists.find((item) => item.ip === it.ip));
    const allSelected = selectable.length === this.state.selected.length;
    const iface = this.state.interfaces.find((item) => item.ip === this.state.interface);
    let len = 0;
    if (iface) {
      len = netMask2Count(iface.netmask);
    }
    const button = /* @__PURE__ */ jsxRuntimeExports.jsx(
      Button,
      {
        style: { marginLeft: len > 256 ? 0 : 16, whiteSpace: "nowrap", width: 250 },
        variant: "contained",
        disabled: !this.state.alive || !this.state.interface,
        onClick: () => {
          if (this.state.running) {
            this.props.socket.setState(`ping.${this.props.instance}.browse.running`, false);
          } else {
            this.browse();
          }
        },
        startIcon: /* @__PURE__ */ jsxRuntimeExports.jsx(Search, {}),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { marginLeft: 8 }, children: this.state.running ? `${this.state.status} ${I18n.t("custom_ping_stop")}` : I18n.t("custom_ping_browse") })
      }
    );
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { width: "100%" }, className: "ping_custom", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { children: I18n.t("custom_ping_title") }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { width: "100%", display: "flex", alignItems: "center" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(FormControl, { style: { width: "100%", maxWidth: 600 }, variant: "standard", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(InputLabel, { children: I18n.t("custom_ping_interface") }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Select,
            {
              variant: "standard",
              disabled: this.state.running,
              value: this.state.interface,
              onChange: (e) => {
                let rangeStart = "";
                let rangeLength = "";
                const _iface = this.state.interfaces.find((item) => item.ip === e.target.value);
                if (_iface && netMask2Count(_iface.netmask) > 256) {
                  const parts = _iface.ip.split(".");
                  parts[3] = "1";
                  rangeStart = parts.join(".");
                  rangeLength = 254;
                }
                this.setState({ interface: e.target.value, rangeStart, rangeLength }, async () => {
                  await this.props.socket.setState(`ping.${this.props.instance}.browse.interface`, this.state.interface);
                  await this.props.socket.setState(`ping.${this.props.instance}.browse.rangeStart`, this.state.rangeStart);
                  await this.props.socket.setState(`ping.${this.props.instance}.browse.rangeLength`, this.state.rangeLength);
                });
              },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(MenuItem, { value: "", children: /* @__PURE__ */ jsxRuntimeExports.jsx("em", { children: I18n.t("custom_ping_select_interface") }) }),
                this.state.interfaces.map((item) => {
                  const len2 = netMask2Count(item.netmask);
                  return /* @__PURE__ */ jsxRuntimeExports.jsx(
                    MenuItem,
                    {
                      value: item.ip,
                      children: `${item.name} - ${item.ip} (${len2} ${I18n.t("custom_ping_ips")})`
                    },
                    item.ip
                  );
                })
              ]
            }
          )
        ] }),
        len > 256 ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          TextField,
          {
            variant: "standard",
            style: { marginLeft: 8, width: 300 },
            label: I18n.t("custom_ping_range_begin"),
            value: this.state.rangeStart,
            onChange: (e) => {
              this.setState({ rangeStart: e.target.value }, async () => {
                await this.props.socket.setState(`ping.${this.props.instance}.browse.rangeStart`, this.state.rangeStart);
              });
            },
            disabled: this.state.running
          }
        ) : null,
        len > 256 ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          TextField,
          {
            variant: "standard",
            style: { marginLeft: 8, width: 150 },
            label: I18n.t("custom_ping_range_length"),
            value: this.state.rangeLength,
            onChange: (e) => {
              this.setState({ rangeLength: e.target.value }, async () => {
                await this.props.socket.setState(`ping.${this.props.instance}.browse.rangeLength`, this.state.rangeLength);
              });
            },
            type: "number",
            slotProps: { htmlInput: { min: 1, max: 254 } },
            disabled: this.state.running
          }
        ) : null,
        len <= 256 ? button : null
      ] }),
      len > 256 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "100%", marginTop: 10 }, children: button }) : null,
      this.state.running ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        LinearProgress,
        {
          value: this.state.progress / 255 * 100,
          variant: "determinate",
          style: { marginTop: 10 }
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: 4, marginTop: 10 } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Button,
        {
          variant: "contained",
          style: { marginTop: 10, marginBottom: 10 },
          disabled: !this.state.selected.length,
          onClick: () => {
            const devices = [...this.props.data.devices];
            this.state.selected.forEach((ip) => {
              if (!devices.find((item) => item.ip === ip)) {
                devices.push({ ip, name: ip });
              }
            });
            const data = JSON.parse(JSON.stringify(this.props.data));
            data.devices = devices;
            devices.sort((a, b) => a.ip > b.ip ? 1 : a.ip < b.ip ? -1 : 0);
            this.props.onChange(data);
            this.setState({ selected: [] });
          },
          children: I18n.t("custom_ping_add")
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableContainer, { component: Paper, style: { width: "100%" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { style: { width: "100%" }, size: "small", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { style: { background: this.props.themeType === "dark" ? "#333" : "#DDD" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { style: { height: 55 }, children: selectable.length ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            Checkbox,
            {
              title: I18n.t("custom_ping_select_all"),
              disabled: !selectable.length,
              indeterminate: !allSelected && this.state.selected.length,
              checked: allSelected,
              onClick: () => {
                if (!allSelected) {
                  this.setState({ selected: selectable });
                } else {
                  this.setState({ selected: [] });
                }
              }
            }
          ) : null }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            TableCell,
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                height: 55
              },
              children: I18n.t("custom_ping_ip")
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: I18n.t("custom_ping_mac") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: I18n.t("custom_ping_vendor") }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: I18n.t("custom_ping_ignore") })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: this.state.ips.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          TableRow,
          {
            sx: { "&:last-child td, &:last-child th": { border: 0 } },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { component: "th", scope: "row", children: !exists.find((it) => it.ip === item.ip) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                Checkbox,
                {
                  checked: this.state.selected.includes(item.ip),
                  style: { padding: "0 8px" },
                  onChange: () => {
                    const selected = this.state.selected;
                    const pos = selected.indexOf(item.ip);
                    if (pos === -1) {
                      selected.push(item.ip);
                    } else {
                      selected.splice(pos, 1);
                    }
                    this.setState({ selected });
                  }
                }
              ) : null }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: item.ip }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: item.mac }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: item.vendor }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: !exists.find((it) => it.ip === item.ip) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                Checkbox,
                {
                  checked: item.ignore,
                  style: { padding: "0 8px" },
                  onChange: () => {
                    const ips = [...this.state.ips];
                    const editedItem = ips.find((it) => it.ip === item.ip);
                    if (editedItem) {
                      editedItem.ignore = !editedItem.ignore;
                      this.setState({ ips }, () => this.props.socket.setState(`ping.${this.props.instance}.browse.result`, JSON.stringify(ips), false));
                    }
                  }
                }
              ) : null })
            ]
          },
          item.ip
        )) })
      ] }) })
    ] });
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
  onChange: PropTypes.func
};

const Components = { PingBrowseComponent };

export { Components as default };
