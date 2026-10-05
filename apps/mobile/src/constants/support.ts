/**
 * Swapngo's rider support contact details — the one place they are set.
 *
 * Every screen that shows a way to reach support reads from here, so adding,
 * removing or changing a number or the email is a one-file change. Mirrored
 * in apps/web/src/rider/constants/support.ts (a separate bundle, so it cannot
 * import this file) and apps/website/src/content/contact.ts.
 */
export interface SupportPhone {
    /** Dialable, E.164 — used in the tel: link. */
    e164: string;
    /** How the number is printed on screen. */
    display: string;
}

export const SUPPORT_EMAIL = 'support@swapngo.in';

export const SUPPORT_PHONES: readonly SupportPhone[] = [
    { e164: '+919600999046', display: '+91 96009 99046' },
    { e164: '+919600999047', display: '+91 96009 99047' },
];
