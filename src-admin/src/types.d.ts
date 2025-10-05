export interface PingAdapterConfig {
    devices: {
        enabled?: boolean;
        name: string;
        use_name?: boolean;
        ip: string;
        extended_info?: boolean;
    }[];
    interval: number | string;
    intervalByUnreach: number | string;
    numberOfRetries: number | string;
    noHostname: boolean;
    autoDetect: string;
}
