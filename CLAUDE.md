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
- **`src/lib/ping.ts`** — Core ping logic. `probe(addr, config, callback)` dispatches to either TCP port check (via `net.Socket`) or OS-level ICMP ping (spawns `/bin/ping`, `ping.exe`, or `/sbin/ping` depending on platform). Supports `host:port` syntax for TCP checks.
- **`src/lib/setcup.ts`** — Linux helper that runs `setcap` to grant ping permissions without root.
- **`src/lib/wakeOnLan.ts`** — Wake-on-LAN implementation (not yet integrated into the adapter).
- **`src/lib/i18n/`** — Translation JSON files (copied to `build/lib/i18n/` by `tasks.js`).
- **`src/types.d.ts`** — `DeviceConfig` and `PingAdapterConfig` interfaces.

### Admin UI (`src-admin/`)
React + Vite app using ioBroker's Module Federation pattern. Builds to `src-admin/build/`, then `tasks.js` copies output to `admin/custom/`.

- **`src-admin/src/PingBrowseComponent.tsx`** — React component for the network browse UI tab.
- **`src-admin/src/Components.tsx`** — Module Federation entry point, exports `{ PingBrowseComponent }`.
- Has its own `package.json` and `node_modules`; must be built separately.

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

**TCP port detection:** If `addr` matches `host:port` pattern, uses TCP socket connection instead of ICMP ping. The `host` field in the result includes the port (e.g., `"192.168.1.1:80"`).
