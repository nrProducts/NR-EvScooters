/**
 * Pure auth input helpers. No React Native, no Supabase, no env — so they run
 * under the node-based vitest config exactly like the mock does.
 */

/** Strip spaces, dashes and brackets. Keeps a leading "+". */
export function normalizePhone(input: string): string {
    return input.trim().replace(/[\s()-]/g, '');
}

/**
 * The bare 10 digits of an Indian mobile: digits only, a leading 91 or 0
 * dropped only when there are MORE than 10 digits (a 10-digit number may
 * itself start 91 or 0), capped at 10. Safe on every keystroke and on a
 * pasted "+91 98765 43210".
 */
export function sanitizePhoneInput(raw: string): string {
    let digits = raw.replace(/\D/g, '');
    if (digits.length > 10) digits = digits.replace(/^(?:91|0)/, '');
    return digits.slice(0, 10);
}

/** Indian mobile: exactly 10 digits starting 6-9 (a +91 / 91 / 0 prefix is tolerated). */
export function isValidPhone(input: string): boolean {
    const digits = input.replace(/\D/g, '');
    const bare = digits.length > 10 ? digits.replace(/^(?:91|0)/, '') : digits;
    return /^[6-9]\d{9}$/.test(bare);
}

/**
 * Ensures a "+" prefix. If the number has no country code (starts 6–9 and is
 * 10 digits, the Indian mobile shape), default it to +91 — the app's home
 * market — so a rider can type just their 10-digit number.
 */
export function toE164(input: string, defaultCountryCode = '91'): string {
    return `+${defaultCountryCode}${sanitizePhoneInput(input)}`;
}

/** OTP codes are exactly 6 digits. */
export function isValidOtp(code: string): boolean {
    return /^\d{6}$/.test(code.trim());
}

/** Keep only digits, capped at 6 — for the OTP input's onChangeText. */
export function sanitizeOtpInput(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 6);
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
