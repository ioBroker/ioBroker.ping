# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker.ping is an ioBroker adapter that cyclically pings configured IP addresses (ICMP) or checks TCP ports and exposes the results as ioBroker states. Node.js >= 20 required.

## Commands

```bash
# Full build (TypeScript + admin React UI)
npm run build

# TypeScript backend only
npm run build:tsc

# Lint
npm run lint

# Run integration tests
npm test

# Run package tests only
npm run test:package

# Admin build steps individually (via tasks.js)
node tasks --admin-0-clean
node tasks --admin-1-npm
node tasks --admin-2-compile
node tasks --admin-3-copy

# Install all dependencies (root + src-admin)
npm run npm
```

## Architecture

The project has two separate parts with their own build pipelines:

### Backend (`src/`)
TypeScript compiled to `build/` via `tsconfig.build.json`. Entry point is `build/main.js`.

- **`src/main.ts`** — `PingAdapter` class extending `@iobroker/adapter-core`'s `Adapter`. Contains all adapter logic: state/object lifecycle, ping scheduling, network browsing, message handling.
- **`src/lib/ping.ts`** — Core ping logic. `probe(addr, config, callback)` dispatches to a TCP port check (via `net.Socket`) or an OS ping; `parseAddress()` decides which (see *TCP port detection*). `probe()` must never throw synchronously - a throw of `socket.connect` is caught and reported as one asynchronous `{ alive: false, error }`. `buildPingCommand(platform, host, options)` is the pure platform/argument decision: linux `ping -n -w -c` (IPv6 needs no `-6`), win32 `ping.exe -n -w <ms>`, darwin/freebsd `ping -n -t -c` for IPv4 and `ping6 -n -c` for IPv6 - ping6 has no timeout option, so `probe()` kills it after `killAfter` ms. `parsePingTime()` reads the round trip, including the Windows IPv6 reply (no TTL) and the `hlim=` of ping6; on Windows only a parsed time means alive (ping.exe also exits 0 on "Destination host unreachable"), elsewhere exit code 0. Covered by `test/testParseAddress.js`, `test/testTcpPort.js`, `test/testPingCommand.js`.
- **`src/lib/setcup.ts`** — Linux helper that runs `setcap` to grant ping permissions without root. Runs `setcap` directly when the adapter is root, `sudo setcap` otherwise, and reports stderr on failure.
- **`src/lib/pingFallback.ts`** — What happens when this host may not send ICMP at all. An unprivileged LXC container has neither `cap_net_raw` on its ping binary nor a `ping_group_range` that covers the ioBroker user, and every device would be reported as offline without a word about why. `isPermissionError()` classifies the stderr of the ping process (`ping.ts` puts the verdict into `PingResult.denied`), `deniedHint()` is the warning `main.ts` logs once, and `probeTcp()` is the optional replacement check: a connect to `tcpFallbackPorts`, where a refused connection counts as "alive" just as well as an open port. Off by default — a connect is not the same question as an echo request, so it may not silently redefine what the `alive` state means. `main.ts probeWithFallback()` is the single place both the device loop and the network browse go through. Covered by `test/testPingFallback.js`.
- **`src/lib/udpWake.ts`** — Wakes sleeping devices (e.g. iPhones) before the ping: `sendUdpBurst()` sends 10 empty UDP packets to port 5353 via `node:dgram`, `ping.ts` waits `UDP_WAKE_SETTLE` (1 s) and pings then. Replaced the former `hping3` call. Enabled per device by `use_hping3` (attribute name kept for existing configurations). Covered by `test/testUdpWake.js`.
- **`src/lib/wakeOnLan.ts`** — Wake-on-LAN implementation (not yet integrated into the adapter).
- **`src/lib/i18n/`** — Translation JSON files (copied to `build/lib/i18n/` by `tasks.js`).
- **`src/types.d.ts`** — `DeviceConfig` and `PingAdapterConfig` interfaces.

### Admin UI (`src-admin/`)
React + Vite app using ioBroker's Module Federation pattern. Builds to `src-admin/build/`, then `tasks.js` copies output to `admin/custom/`.

- **`src-admin/src/PingBrowseComponent.tsx`** — React component for the network browse UI tab.
- **`src-admin/src/Components.tsx`** — Module Federation entry point, exports `{ PingBrowseComponent }`.
- Has its own `package.json` and `node_modules`; must be built separately.

### Web components (`src-webcomponents/`)
The devices widgets "Ping Device" and "Ping Overview" as `@iobroker/web-components` for Aura, vis-2, admin and other hosts: `<iob-ping-device>` and `<iob-ping-overview>`, listed in `common.webComponents`. Own `package.json`, plain React + CSS in a shadow root, React taken from the host (`lib/esm/react-19.js`). One `vite build --mode <name>` per component, so each is one module file; the build writes and checks the manifests. Output `admin/webcomponents/<name>.js` + `<name>.json` is committed.

- **`src/pingDevices.ts`** — derives the state IDs of the configured devices from `system.adapter.ping.<n>` the same way `main.ts prepareObjectsForHost()` does; keep both in sync.
- **`src/manifest.ts`** — the manifests; `name` must stay equal to the `label` of the devices widget in `common.deviceWidgets`, so devices shows its own widget instead.
- `npm run build:wc` (`node tasks --wc`), `npm run lint:wc`, `npm run check:wc`.

### Build orchestration (`tasks.js`)
Uses `@iobroker/build-tools` to coordinate admin installation, compilation, and file copying. Run via `npm run build` which chains `build:tsc` then `node tasks`.

## Key Patterns

**Ping scheduling:** Two independent ping loops run concurrently — one for online devices (using `config.interval`) and one for offline/unreachable devices (using `config.intervalByUnreach`). Each restarts itself via `setTimeout` after completing a full scan.

**State structure:**
- Simple mode: `ping.0.<host>.<id>` — boolean `alive` state
- Extended mode: `ping.0.<host>.<id>.alive`, `.time` (seconds), `.rps` (hz)
- Browse states: `ping.0.browse.{running, progress, status, result, interface, rangeStart, rangeLength}`

**Object sync (`syncObjects`):** On startup, compares desired state tree against existing ioBroker objects and creates/updates/deletes as needed. Browse-related objects are excluded from cleanup.

**Messages:** The adapter responds to `sendTo` messages: `ping` (single probe), `ping:settings:browse` (network scan), `ping:addIpAddress`, `ping:save`, `getNotificationSchema`/`admin:getNotificationSchema`.

**TCP port detection:** `host:port` with exactly one colon (host name or IPv4) or `[IPv6]:port` is a TCP check; every other address is pinged - IPv6 without brackets (`fd00::1` is not `fd00:` with port 1) and `[IPv6]` without a port (brackets stripped). A port outside 1-65535 gives `error`: nothing is checked, the device is `alive: false`, and `main.ts prepareObjectsByConfig()` warns once at start. The `host` field in the result keeps the address as written (`"192.168.1.1:80"`, `"[fd00::1]:80"`). State IDs are always built from the configured `ip` string (`prepareObjectsForHost()`, `src-devices/src/utils.ts`, `src-webcomponents/src/pingDevices.ts`), never from `parseAddress()` - keep it that way.

**Devices widgets (`src-devices/`):** `utils.ts` derives the state IDs like `main.ts prepareObjectsForHost()` - keep them in sync. In `PingIpAddressComponent.tsx` every setting that changes the subscribed IDs (instance, deviceId, showResponseTime) belongs in `getSubscriptionSettings()`; a difference from the last round triggers `resubscribe()`, which drops late results of older rounds. `admin/dm-widgets/` and `src-devices/build/assets/` are committed; rebuild with `node tasks --devices-0-clean`, `--devices-2-compile`, `--devices-3-copy` (step 2 logs build errors but exits 0 - read its output).
