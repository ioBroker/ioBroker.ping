/**
 * The answer of the message `help`: what the instance answers, written for an AI agent (e.g. ioBroker.pi-agent, or
 * the MCP server with `send_to`) and for script authors. Keep it in sync with `processMessage` in main.ts, with the
 * Device Manager (dm-utils answers the `dm:` commands itself) and the README.
 */

/** One command which the instance answers; `write` = it changes something */
export interface HelpCommand {
    command: string;
    write: boolean;
}

/** The commands the instance answers: those of `processMessage` and the `dm:` commands of dm-utils */
export const COMMANDS: HelpCommand[] = [
    { command: 'help', write: false },
    { command: 'ping', write: false },
    { command: 'wakeOnLan', write: true },
    { command: 'ping:settings:browse', write: true },
    { command: 'ping:addIpAddress', write: true },
    { command: 'ping:save', write: true },
    { command: 'getNotificationSchema', write: false },
    { command: 'admin:getNotificationSchema', write: false },
    { command: 'ping:getDevices', write: false },
    { command: 'dm:instanceInfo', write: false },
    { command: 'dm:loadDevices', write: false },
    { command: 'dm:deviceInfo', write: false },
    { command: 'dm:deviceStatus', write: false },
    { command: 'dm:deviceDetails', write: false },
    { command: 'dm:instanceAction', write: true },
    { command: 'dm:deviceAction', write: true },
    { command: 'dm:deviceControl', write: true },
    { command: 'dm:deviceControlState', write: false },
    { command: 'dm:deviceLoadProgress', write: false },
    { command: 'dm:actionProgress', write: true },
];

export const HELP = `ioBroker.ping: checks whether devices answer in the network. It pings the configured addresses (ICMP), or connects
to a TCP port for an address "host:port", in an interval and writes per device whether it answers. An agent can
check any address on demand, see which configured devices answer, check one of them now and switch on a computer
with Wake-on-LAN.

Commands (sendTo ping.0):
- ping "<address>": one check now; the message is the address as a text: an IP, a host name, "host:port" or
  "[IPv6]:port" for a TCP port (1-65535); an IPv6 address without brackets is pinged. Answer {result: {host, alive,
  ms (round trip in milliseconds, null if none), error? (why it was not checked, or what ping wrote), denied?
  (this ioBroker host may not send ICMP)}, error?}.
- wakeOnLan "<mac>" or {mac, ip?}: sends a Wake-on-LAN magic packet (UDP port 9) to the MAC, written with colons
  "01:23:45:67:89:AB"; ip = where to send it, e.g. the broadcast address of the subnet "192.168.1.255" (default
  255.255.255.255). Answer {result: {mac, ip}} or {error: "Invalid MAC address: ..."}. Sent does not mean awake:
  ping the device a minute later.
- ping:settings:browse, ping:addIpAddress, ping:save, getNotificationSchema, admin:getNotificationSchema,
  ping:getDevices, and dm:instanceInfo, dm:loadDevices, dm:deviceInfo, dm:deviceStatus, dm:deviceDetails,
  dm:deviceControlState, dm:deviceLoadProgress (read) and dm:instanceAction, dm:deviceAction, dm:deviceControl,
  dm:actionProgress (write): for the settings, the notification of new devices and the device manager, not for
  agents.

States (ping.0.*): one per configured device, ping.0.<host>.<address> (<host> = the ioBroker host, missing with
the option "No host name in state name"; dots, colons and spaces of the address as _, or the name of the device
with "Use name"). With "Extended Info" it is a channel with alive, time (round trip in seconds) and rps.
alive true = the device answers. Writing false (ack false) checks the device now; writing true sends Wake-on-LAN
to it (MAC from the network browse or from ARP; without a known MAC nothing is sent).

How to talk to the user:
- Name devices by the name of their object, not by the ID or the IP address.
- A device that does not answer may still be on (firewall, a phone asleep): say "does not answer", not "off".
- Wake-on-LAN switches a computer on: only on the user's request; ask which device if that is not clear.`;
