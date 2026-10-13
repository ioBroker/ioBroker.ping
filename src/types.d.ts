export interface DeviceConfig {
    enabled: boolean;
    name: string;
    use_name: boolean;
    ip: string;
    extended_info: boolean;
    /** Wake the device with a UDP burst before the ping. The name is kept from the times of hping3 */
    use_hping3?: boolean;
}
export interface PingAdapterConfig {
    devices: DeviceConfig[];
    interval: number;
    intervalByUnreach: number;
    numberOfRetries: number;
    noHostname: boolean;
    autoDetect: number;
    setcap: boolean;
    /** Check the devices over TCP when this host may not send ICMP - see lib/pingFallback.ts */
    tcpFallback: boolean;
    /** Ports the TCP fallback tries, comma separated */
    tcpFallbackPorts: string;
}
