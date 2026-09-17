/**
 * Swapngo's rider support contact details — mirrors
 * apps/mobile/src/constants/support.ts. Every support surface reads from here,
 * so changing a number or the email is a one-file change.
 */
export interface SupportPhone {
  /** Dialable, E.164 — used in the tel: link. */
  e164: string;
  /** How the number is printed on screen. */
  display: string;
}

export const SUPPORT_EMAIL = "support@swapngo.in";

export const SUPPORT_PHONES: readonly SupportPhone[] = [
  { e164: "+919600999046", display: "+91 96009 99046" },
  { e164: "+919600999047", display: "+91 96009 99047" },
];
