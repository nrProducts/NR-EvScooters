/**
 * Ported verbatim from apps/mobile/src/lib/authValidation.ts — keep in sync.
 * Pure auth input helpers.
 */

/** Strip spaces, dashes and brackets. Keeps a leading "+". */
export function normalizePhone(input: string): string {
    return input.trim().replace(/[\s()-]/g, '');
}

/** E.164-ish: optional "+", leading non-zero digit, 8–15 digits total. */
export function isValidPhone(input: string): boolean {
    return /^\+?[1-9]\d{7,14}$/.test(normalizePhone(input));
}

export function toE164(input: string, defaultCountryCode = '91'): string {
    const cleaned = normalizePhone(input);
    if (cleaned.startsWith('+')) return cleaned;
    if (/^[6-9]\d{9}$/.test(cleaned)) return `+${defaultCountryCode}${cleaned}`;
    return `+${cleaned}`;
}

/** OTP codes are exactly 6 digits. */
export function isValidOtp(code: string): boolean {
    return /^\d{6}$/.test(code.trim());
}

/** Keep only digits, capped at 6 — for the OTP input's onChange. */
export function sanitizeOtpInput(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 6);
}

export function formatPhoneForDisplay(e164: string): string {
    const m = /^\+(\d{1,3})(\d{5})(\d{5})$/.exec(e164);
    if (!m) return e164;
    return `+${m[1]} ${m[2]} ${m[3]}`;
}
