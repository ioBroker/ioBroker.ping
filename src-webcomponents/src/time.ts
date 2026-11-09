/**
 * How long ago something changed, in the language of the system - with `Intl` of the browser, no library.
 * Up to a day as a duration ("5 minutes", "5 minutes ago"), from then on as date and time.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Unit = 'second' | 'minute' | 'hour';

function getUnit(age: number): { value: number; unit: Unit } {
    if (age < MINUTE) {
        return { value: Math.max(1, Math.floor(age / 1000)), unit: 'second' };
    }
    if (age < HOUR) {
        return { value: Math.floor(age / MINUTE), unit: 'minute' };
    }
    return { value: Math.floor(age / HOUR), unit: 'hour' };
}

function locale(lang: string): string {
    try {
        return Intl.getCanonicalLocales(lang)[0] || 'en';
    } catch {
        return 'en';
    }
}

/**
 * Since when something is so: "5 minutes" with `ago` false, "5 minutes ago" with `ago` true, or the date and
 * time if it is a day or longer ago
 *
 * @param ts when it changed, in ms
 * @param now the time to compare with, in ms
 * @param lang the language of the system
 * @param ago with "ago", for a state that is over
 */
export function formatSince(ts: number, now: number, lang: string, ago: boolean): string {
    const loc = locale(lang);
    const age = Math.max(0, now - ts);
    if (age >= DAY) {
        return new Date(ts).toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' });
    }
    const { value, unit } = getUnit(age);
    if (ago) {
        return new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }).format(-value, unit);
    }
    return new Intl.NumberFormat(loc, { style: 'unit', unit, unitDisplay: 'long' }).format(value);
}
