export interface DeviceConfig {
    enabled: boolean;
    name: string;
    use_name: boolean;
    ip: string;
    extended_info: boolean;
    /** Wake the device with a UDP burst before the ping. The name is kept from the times of hping3 */
    use_hping3?: boolean;
    /**
     * Bytes of data in the echo request, empty for the default of the ping binary (56 on Linux, 32 on Windows).
     * Some devices only answer one size, e.g. the KNX IP interface 730 of Weinzierl only 32 bytes (#387)
     */
    packetSize?: number | string | null;
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
