import type { JSX } from 'react';

/** A network: the picture of the hint */
const LAN_PATH = 'M13 22h8v-7h-3v-4h-5V9h3V2H8v7h3v2H6v4H3v7h8v-7H8v-2h8v2h-3z';

/**
 * A hint instead of the content: a setting is missing or names nothing of the ping adapter
 *
 * @param props the text and whether the host is in edit mode
 * @param props.text what to say
 * @param props.editMode in edit mode the element takes no clicks
 */
export function Hint({ text, editMode }: { text: string; editMode: boolean }): JSX.Element {
    return (
        <div className={`hint${editMode ? ' edit' : ''}`}>
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path d={LAN_PATH} />
            </svg>
            <span>{text}</span>
        </div>
    );
}
