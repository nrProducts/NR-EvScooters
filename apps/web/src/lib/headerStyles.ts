/**
 * The round white control every top-bar action shares (refresh, theme, the two
 * bells). One size on purpose: every control in the header is 36px tall, so the
 * search pill, the buttons, the role chip and the avatar share one centre line.
 * Lives here rather than in Header.tsx because the bell components use it too,
 * and Header imports them — a constant exported from Header would make that a
 * circular import.
 */
export const HEADER_ROUND_BUTTON =
  "h-9 w-9 rounded-full bg-card text-foreground shadow-card hover:bg-card hover:text-foreground hover:shadow-md";

/** The small icon inside those buttons. */
export const HEADER_ICON = "h-4 w-4";

/** The count badge sitting on a button's top-right corner. */
export const HEADER_BADGE =
  "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.5625rem] font-semibold leading-none ring-2 ring-background";
