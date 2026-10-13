import { createSocket } from 'node:dgram';
import { isIPv6 } from 'node:net';

/** mDNS - a port a sleeping iPhone still listens to with its WiFi chip */
export const UDP_WAKE_PORT = 5353;

/** Number of packets of one burst */
export const UDP_WAKE_COUNT = 10;

/**
 * Time the device needs to come up after the burst.
 *
 * A ping sent right after the burst finds the device still asleep, so it has to wait at least a second.
 */
export const UDP_WAKE_SETTLE = 1000;

export interface UdpWakeOptions {
    port?: number;
    count?: number;
}

/**
 * Send a burst of empty UDP packets to wake a sleeping device (e.g. an iPhone in deep sleep).
 *
 * The same as `hping3 -2 -c 10 -p 5353 -i u1 -q <host>`, but without an external binary, so it
 * works on every platform and without root rights. Nobody answers these packets - whether the
 * device is there decides only the ping that follows.
 */
export async function sendUdpBurst(host: string, options?: UdpWakeOptions): Promise<void> {
    const port = options?.port || UDP_WAKE_PORT;
    const count = options?.count || UDP_WAKE_COUNT;
    const socket = createSocket(isIPv6(host) ? 'udp6' : 'udp4');
    const payload = Buffer.alloc(0);

    // Without a listener an ICMP "port unreachable" from the device would be thrown as an uncaught error
    socket.on('error', () => {});

    try {
        for (let i = 0; i < count; i++) {
            await new Promise<void>((resolve, reject) =>
                socket.send(payload, port, host, err => (err ? reject(err) : resolve())),
            );
        }
    } finally {
        socket.close();
    }
}
