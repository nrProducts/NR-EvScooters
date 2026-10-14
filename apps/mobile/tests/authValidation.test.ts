import { describe, expect, it } from 'vitest';
import {
  formatPhoneLocal, isValidOtp, isValidPhone, normalizePhone, sanitizeOtpInput, sanitizePhoneInput, toE164,
} from '../src/lib/authValidation';

describe('normalizePhone', () => {
  it('strips spaces, dashes and brackets, keeps +', () => {
    expect(normalizePhone(' +91 98765-43210 ')).toBe('+919876543210');
    expect(normalizePhone('(044) 2345 6789')).toBe('04423456789');
  });
});

describe('isValidPhone', () => {
  it('accepts a 10-digit Indian mobile, with or without a +91 / 91 / 0 prefix', () => {
    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('+919876543210')).toBe(true);
    expect(isValidPhone('919876543210')).toBe(true);
    expect(isValidPhone('9100236548')).toBe(true);
  });
  it('rejects wrong length, bad first digit, foreign numbers and letters', () => {
    expect(isValidPhone('98765')).toBe(false);
    expect(isValidPhone('987654321012')).toBe(false);
    expect(isValidPhone('1234567890')).toBe(false);
    expect(isValidPhone('+14155551234')).toBe(false);
    expect(isValidPhone('+91abc4567890')).toBe(false);
  });
});

describe('sanitizePhoneInput', () => {
  it('keeps only digits and caps at 10', () => {
    expect(sanitizePhoneInput('98765 43210')).toBe('9876543210');
    expect(sanitizePhoneInput('9876543210123')).toBe('9876543210');
  });
  it('drops +91 only from a longer paste, not a 10-digit number starting 91', () => {
    expect(sanitizePhoneInput('+91 98765 43210')).toBe('9876543210');
    expect(sanitizePhoneInput('9100236548')).toBe('9100236548');
  });
});

describe('toE164', () => {
  it('always yields +91 and the bare 10 digits', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
    expect(toE164('+91 98765 43210')).toBe('+919876543210');
    expect(toE164('9100236548')).toBe('+919100236548');
  });
});

describe('isValidOtp / sanitizeOtpInput', () => {
  it('accepts exactly six digits', () => {
    expect(isValidOtp('123456')).toBe(true);
    expect(isValidOtp('12345')).toBe(false);
    expect(isValidOtp('1234567')).toBe(false);
    expect(isValidOtp('12a456')).toBe(false);
  });
  it('keeps digits only, capped at 6', () => {
    expect(sanitizeOtpInput('12-34-56-78')).toBe('123456');
    expect(sanitizeOtpInput('9x9y')).toBe('99');
  });
});

describe('formatPhoneLocal', () => {
  it('strips the +91 country code from an Indian mobile number', () => {
    expect(formatPhoneLocal('+919876543210')).toBe('9876543210');
  });
  it('strips a bare 91 country code with no leading +', () => {
    expect(formatPhoneLocal('919876543210')).toBe('9876543210');
  });
  it('leaves an already-local 10-digit number unchanged', () => {
    expect(formatPhoneLocal('9876543210')).toBe('9876543210');
  });
  it('leaves a non-Indian country code unchanged rather than mangling it', () => {
    expect(formatPhoneLocal('+14155552671')).toBe('+14155552671');
  });
});
