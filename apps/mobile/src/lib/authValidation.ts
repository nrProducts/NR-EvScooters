/**
 * Pure auth input helpers. No React Native, no Supabase, no env — so they run
 * under the node-based vitest config exactly like the mock does.
 */

/** Strip spaces, dashes and brackets. Keeps a leading "+". */
export function normalizePhone(input: string): string {
    return input.trim().replace(/[\s()-]/g, '');
}

/** E.164-ish: optional "+", leading non-zero digit, 8–15 digits total. */
export function isValidPhone(input: string): boolean {
    return /^\+?[1-9]\d{7,14}$/.test(normalizePhone(input));
}

/**
 * Ensures a "+" prefix. If the number has no country code (starts 6–9 and is
 * 10 digits, the Indian mobile shape), default it to +91 — the app's home
 * market — so a rider can type just their 10-digit number.
 */
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

/** Keep only digits, capped at 6 — for the OTP input's onChangeText. */
export function sanitizeOtpInput(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 6);
}

/** "+919876543210" -> "+91 98765 43210"-ish for display. Best-effort. */
export function formatPhoneForDisplay(e164: string): string {
    const m = /^\+(\d{1,3})(\d{5})(\d{5})$/.exec(e164);
    if (!m) return e164;
    return `+${m[1]} ${m[2]} ${m[3]}`;
}

/**
 * "+919876543210" or "919876543210" -> "9876543210" — every rider is Indian
 * (the app's only market), so the +91 in front of their own number on
 * screen is just noise, never information. Anything that isn't that exact
 * shape (already local, or some other country code) is returned unchanged
 * rather than mangled.
 */
export function formatPhoneLocal(raw: string): string {
    const digits = raw.replace(/^\+/, '');
    return /^91[6-9]\d{9}$/.test(digits) ? digits.slice(2) : raw;
}
