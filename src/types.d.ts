export interface DeviceConfig {
    enabled: boolean;
    name: string;
    use_name: boolean;
    ip: string;
    extended_info: boolean;
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
    installHping3: boolean;
    /** Check the devices over TCP when this host may not send ICMP - see lib/pingFallback.ts */
    tcpFallback: boolean;
    /** Ports the TCP fallback tries, comma separated */
    tcpFallbackPorts: string;
}
