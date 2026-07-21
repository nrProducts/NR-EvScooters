import { describe, expect, it } from 'vitest';
import {
  formatPhoneForDisplay, isValidOtp, isValidPhone, normalizePhone, sanitizeOtpInput, toE164,
} from '../src/lib/authValidation';

describe('normalizePhone', () => {
  it('strips spaces, dashes and brackets, keeps +', () => {
    expect(normalizePhone(' +91 98765-43210 ')).toBe('+919876543210');
    expect(normalizePhone('(044) 2345 6789')).toBe('04423456789');
  });
});

describe('isValidPhone', () => {
  it('accepts international numbers with or without +', () => {
    expect(isValidPhone('+919876543210')).toBe(true);
    expect(isValidPhone('919876543210')).toBe(true);
  });
  it('rejects too short, leading zero, and letters', () => {
    expect(isValidPhone('98765')).toBe(false);
    expect(isValidPhone('0919876543210')).toBe(false);
    expect(isValidPhone('+91abc4567890')).toBe(false);
  });
});

describe('toE164', () => {
  it('adds +91 for a bare 10-digit Indian mobile', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
    expect(toE164('98765 43210')).toBe('+919876543210');
  });
  it('keeps an existing + prefix', () => {
    expect(toE164('+14155551234')).toBe('+14155551234');
  });
  it('prefixes + for other bare international numbers', () => {
    expect(toE164('14155551234')).toBe('+14155551234');
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

describe('formatPhoneForDisplay', () => {
  it('groups an E.164 number for display', () => {
    expect(formatPhoneForDisplay('+919876543210')).toBe('+91 98765 43210');
  });
  it('returns the input unchanged when it does not match', () => {
    expect(formatPhoneForDisplay('+1 415')).toBe('+1 415');
  });
});
