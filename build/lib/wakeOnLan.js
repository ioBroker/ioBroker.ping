"use strict";
/**
 * Wake-on-LAN implementation for waking up computers remotely
 * by sending a magic packet to their network interface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMACValid = isMACValid;
exports.default = wakeOnLan;
const node_dgram_1 = require("node:dgram");
const node_dns_1 = require("node:dns");
const node_net_1 = require("node:net");
/** Default broadcast address for network-wide wake-on-LAN */
const BROADCAST = '255.255.255.255';
/** Number of bytes in a MAC address */
const MAC_BYTES = 6;
/** Number of times the MAC address is repeated in the magic packet */
const MAC_REPETITIONS = 16;
/**
 * Send the magic packet to the target IP address
 *
 * @param mac - MAC address of the target computer
 * @param ip - IP address or broadcast address to send to
 * @param magicPacket - Pre-constructed magic packet buffer
 * @param params - Wake-on-LAN parameters including port
 */
function send(mac, ip, magicPacket, params) {
    // Create UDP socket (IPv4 or IPv6 based on target IP)
    const socket = (0, node_dgram_1.createSocket)((0, node_net_1.isIPv6)(ip) ? 'udp6' : 'udp4');
    // Enable broadcast mode if sending to broadcast address
    socket.once('listening', () => socket.setBroadcast(ip === BROADCAST));
    if (ip === BROADCAST) {
        console.log('Broadcasting magic packet to %s.', mac);
    }
    else {
        console.log('Sending magic packet to %s with IP=%s.', mac, ip);
    }
    socket.send(magicPacket, 0, magicPacket.length, params.port, ip, err => {
        if (err) {
            console.log('Sorry ;(');
            console.error(err);
        }
        else {
            console.log("All's fine. Your computer is awakening right now...");
        }
        socket.close();
    });
}
/**
 * Relay mode: Listen for an incoming UDP packet, then send the magic packet
 * This allows triggering wake-on-LAN from a remote location through a relay server
 *
 * @param mac - MAC address of the target computer
 * @param ip - IP address to send the magic packet to
 * @param magicPacket - Pre-constructed magic packet buffer
 * @param params - Wake-on-LAN parameters including relay port
 */
function relay(mac, ip, magicPacket, params) {
    const socket = (0, node_dgram_1.createSocket)('udp4');
    socket.on('error', err => {
        console.log(`Server error:\n${err.stack}`);
        socket.close();
    });
    // When a matching magic packet is received, forward it to the target
    socket.on('message', msg => {
        if (msg.equals(magicPacket)) {
            send(mac, ip, magicPacket, params);
        }
    });
    socket.on('listening', () => {
        const address = socket.address();
        console.log(`Server listening ${address.address}:${address.port}`);
    });
    socket.bind(params.relayPort);
}
/**
 * Create a Wake-on-LAN magic packet
 *
 * The magic packet structure is:
 * - 6 bytes of 0xFF (synchronization stream)
 * - MAC address repeated 16 times (96 bytes total)
 *
 * Total packet size: 102 bytes
 *
 * @param mac - MAC address in format "XX:XX:XX:XX:XX:XX" (hexadecimal with colons)
 * @returns Buffer containing the magic packet
 */
function createMagicPacket(mac) {
    // Parse MAC address from hex string to buffer
    const macBuffer = Buffer.alloc(MAC_BYTES);
    mac.split(':').forEach((value, i) => {
        macBuffer[i] = parseInt(value, 16);
    });
    const buffer = Buffer.alloc(MAC_BYTES + MAC_REPETITIONS * MAC_BYTES);
    // Start the magic packet with 6 bytes of 0xFF (synchronization stream)
    for (let i = 0; i < MAC_BYTES; i++) {
        buffer[i] = 0xff;
    }
    // Copy MAC address 16 times after the synchronization stream
    for (let i = 0; i < MAC_REPETITIONS; i++) {
        macBuffer.copy(buffer, (i + 1) * MAC_BYTES, 0, macBuffer.length);
    }
    return buffer;
}
/**
 * Resolve IP address from parameters
 *
 * Priority order:
 * 1. If host is provided, resolve it via DNS
 * 2. If ip is provided, use it directly
 * 3. Otherwise, use broadcast address
 *
 * @param params - Wake-on-LAN parameters
 * @returns Promise that resolves to the IP address to use
 */
function getIP(params) {
    return new Promise(resolve => {
        if (!params.host) {
            // Use provided IP or fall back to broadcast
            resolve(params.ip || BROADCAST);
        }
        else {
            // Resolve hostname to IP address
            (0, node_dns_1.resolve)(params.host, (err, addresses) => {
                if (err) {
                    console.error(err);
                    resolve(BROADCAST);
                }
                else {
                    resolve(addresses[0]);
                }
            });
        }
    });
}
/**
 * Validate MAC address format
 *
 * Accepts MAC addresses in the format:
 * - With separators: "XX:XX:XX:XX:XX:XX" (12 hex chars + 5 separators)
 * - Without separators: "XXXXXXXXXXXX" (12 hex chars)
 *
 * @param mac - MAC address string to validate
 * @returns true if valid, false otherwise
 */
function isMACValid(mac) {
    let validationMac = mac;
    // Remove separator characters if present (e.g., colons, dashes)
    if (validationMac.length === 2 * MAC_BYTES + (MAC_BYTES - 1)) {
        validationMac = validationMac.replace(new RegExp(validationMac[2], 'g'), '');
    }
    // Check if we have exactly 12 hexadecimal characters
    return !(validationMac.length !== 2 * MAC_BYTES || validationMac.match(/[^a-fA-F0-9]/));
}
/**
 * Wake up a computer using Wake-on-LAN magic packet
 *
 * This function sends a special network packet (magic packet) to wake up
 * a computer that supports Wake-on-LAN functionality. The computer's network
 * interface must be configured to accept WOL packets.
 *
 * @param mac - MAC address of the target computer (format: "XX:XX:XX:XX:XX:XX")
 * @param params - Configuration parameters for the wake operation
 * @param params.port - UDP port to send to (typically 7 or 9)
 * @param params.host - Optional hostname to resolve
 * @param params.ip - Optional IP address (alternative to host)
 * @param params.relay - Use relay mode (listen for trigger packet)
 * @param params.relayPort - Port to listen on in relay mode
 * @example
 * ```typescript
 * wakeOnLan('01:23:45:67:89:AB', { port: 9 });
 * wakeOnLan('01:23:45:67:89:AB', { port: 9, ip: '192.168.1.255' });
 * ```
 */
function wakeOnLan(mac, params) {
    void getIP(params).then((ip) => {
        const magicPacket = createMagicPacket(mac);
        if (params.relay) {
            relay(mac, ip, magicPacket, params);
        }
        else {
            send(mac, ip, magicPacket, params);
        }
    });
}
//# sourceMappingURL=wakeOnLan.js.map