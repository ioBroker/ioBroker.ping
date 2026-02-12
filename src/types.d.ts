export interface DeviceConfig {
    enabled: boolean;
    name: string;
    use_name: boolean;
    ip: string;
    extended_info: boolean;
}
export interface PingAdapterConfig {
    devices: DeviceConfig[];
    interval: number;
    intervalByUnreach: number;
    numberOfRetries: number;
    noHostname: boolean;
    autoDetect: number;
    setcap: boolean;
}
