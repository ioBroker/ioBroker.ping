declare module 'ip' {
    interface SubnetInfo {
        firstAddress: string;
        length: number;
    }
    function subnet(ip: string, netmask: string): SubnetInfo;
    function toLong(ip: string): number;
    function fromLong(num: number): string;
}
