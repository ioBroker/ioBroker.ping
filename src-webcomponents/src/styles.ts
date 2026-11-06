/**
 * The styles of the shadow roots. An element fills the box of the host, has a transparent background and inherits
 * `color` and `font`; the colors of a state come from the theme of the host (`--iob-success`, `--iob-error`, ...),
 * so it looks right in light and dark. Sizes follow the box with container queries (`cqmin`), nothing is measured.
 */

/** The box, and the hint shown instead of the content while settings are missing */
const BASE = `
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it */
    container-type: size;
}
.edit {
    pointer-events: none;
}
.hint {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 3cqmin, 8px);
    overflow: hidden;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(10px, 7cqmin, 15px);
}
.hint svg {
    width: clamp(16px, 14cqmin, 32px);
    height: clamp(16px, 14cqmin, 32px);
    fill: currentColor;
    flex: none;
}
`;

/** `<iob-ping-device>`: name, IP address, a pill with the state and the response time */
export const DEVICE_STYLES = `${BASE}
.device {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: clamp(4px, 5cqmin, 12px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 4cqmin, 10px);
    overflow: hidden;
    text-align: center;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
}
.device.clickable {
    cursor: pointer;
}
.device:focus-visible {
    box-shadow: inset 0 0 0 2px var(--iob-primary);
    border-radius: calc(var(--iob-border-radius) * 2);
}
.name {
    max-width: 100%;
    font-weight: 600;
    font-size: clamp(10px, 10cqmin, 20px);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ip {
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    /* as big as the box allows: the height, or the width for the number of characters */
    font-size: max(9px, min(16cqh, calc(92cqw / (var(--chars, 12) * 0.62))));
}
.ip span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
}
.copied {
    color: var(--iob-success);
    font-size: 0.8em;
}
.status {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5em;
    font-size: clamp(9px, 7.5cqmin, 15px);
}
.pill {
    --state: var(--iob-text-secondary);
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.2em 0.75em;
    border-radius: 999px;
    color: var(--state);
    background: color-mix(in srgb, var(--state) 16%, transparent);
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.4;
    text-transform: uppercase;
    white-space: nowrap;
}
.pill::before {
    content: '';
    width: 0.55em;
    height: 0.55em;
    border-radius: 50%;
    background: currentColor;
}
.pill.online {
    --state: var(--iob-success);
}
.pill.offline {
    --state: var(--iob-error);
}
.time {
    color: var(--iob-text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
/* a wide, low box: the height limits, not the width */
@container (min-aspect-ratio: 2 / 1) {
    .name {
        font-size: clamp(10px, 14cqh, 22px);
    }
    .ip {
        font-size: max(9px, min(24cqh, calc(92cqw / (var(--chars, 12) * 0.62))));
    }
    .status {
        font-size: clamp(9px, 11cqh, 15px);
    }
}
`;

/** `<iob-ping-overview>`: online / offline, a bar with the ratio and the number of devices */
export const OVERVIEW_STYLES = `${BASE}
.overview {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: clamp(4px, 5cqmin, 12px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(3px, 5cqmin, 12px);
    overflow: hidden;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
    border-radius: calc(var(--iob-border-radius) * 2);
}
.overview.clickable {
    cursor: pointer;
}
.overview.clickable:hover {
    background: color-mix(in srgb, currentColor 6%, transparent);
}
.overview:focus-visible {
    box-shadow: inset 0 0 0 2px var(--iob-primary);
}
.counts {
    display: flex;
    align-items: flex-start;
    gap: clamp(6px, 7cqmin, 20px);
    font-variant-numeric: tabular-nums;
}
.count {
    display: flex;
    flex-direction: column;
    align-items: center;
}
.number,
.slash {
    font-size: clamp(14px, 20cqmin, 56px);
    line-height: 1;
}
.number {
    font-weight: 800;
}
.slash {
    font-weight: 300;
    opacity: 0.4;
}
.count.online .number {
    color: var(--iob-success);
}
.count.offline .number {
    color: var(--iob-error);
}
.label {
    margin-top: 0.3em;
    font-size: clamp(8px, 6.5cqmin, 14px);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--iob-text-secondary);
}
.bar {
    display: flex;
    width: 90%;
    height: clamp(3px, 3.5cqmin, 8px);
    border-radius: 999px;
    overflow: hidden;
    background: var(--iob-divider);
}
.bar .online {
    background: var(--iob-success);
}
.bar .offline {
    background: var(--iob-error);
}
.bar .unknown {
    background: var(--iob-text-secondary);
    opacity: 0.5;
}
.total {
    max-width: 100%;
    font-size: clamp(9px, 7cqmin, 14px);
    color: var(--iob-text-secondary);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
`;

/** The dialog of `<iob-ping-overview>` with all devices; the host frames it, the theme comes as variables */
export const DIALOG_STYLES = `
:host {
    display: block;
}
.list {
    box-sizing: border-box;
    width: 100%;
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
}
.summary {
    margin-bottom: 12px;
    color: var(--iob-text-secondary);
}
.summary b.online {
    color: var(--iob-success);
}
.summary b.offline {
    color: var(--iob-error);
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
}
.tile {
    --state: var(--iob-text-secondary);
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--iob-divider);
    border-left: 4px solid var(--state);
    border-radius: calc(var(--iob-border-radius) * 1.5);
    background: color-mix(in srgb, var(--state) 8%, var(--iob-paper));
}
.tile.online {
    --state: var(--iob-success);
}
.tile.offline {
    --state: var(--iob-error);
}
.dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--state);
}
.tile.unknown .dot {
    opacity: 0.5;
}
.info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.info > * {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.name {
    font-weight: 700;
}
.ip {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85em;
    color: var(--iob-text-secondary);
}
.since {
    margin-top: 2px;
    font-size: 0.85em;
    font-weight: 600;
    color: var(--state);
}
.empty {
    padding: 16px 0;
    color: var(--iob-text-secondary);
}
`;
