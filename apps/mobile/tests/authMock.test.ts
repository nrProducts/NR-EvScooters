import { beforeEach, describe, expect, it } from 'vitest';
import { MockAuthRepository, resetMockDb } from '../src/services/mock/mock.repositories';
import { ApiError } from '../src/lib/ApiError';

describe('MockAuthRepository — phone OTP', () => {
  let auth: MockAuthRepository;
  beforeEach(() => {
    resetMockDb();
    auth = new MockAuthRepository();
  });

  it('requesting an OTP does not throw and sends no SMS', async () => {
    await expect(auth.requestPhoneOtp('+919876543210')).resolves.toBeUndefined();
  });

  it('verifies the demo code 123456 and returns a session', async () => {
    await auth.requestPhoneOtp('+919876500011');
    const ref = await auth.verifyPhoneOtp('+919876500011', '123456');
    expect(ref.id).toBeTruthy();
  });

  it('matches the session to the demo rider with that phone number', async () => {
    const ref = await auth.verifyPhoneOtp('+919876500011', '123456');
    // u-rider-002 is seeded with +919876500011
    expect(ref.id).toBe('u-rider-002');
  });

  it('rejects a wrong code', async () => {
    await expect(auth.verifyPhoneOtp('+919876500011', '000000')).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a non-6-digit code as a validation error', async () => {
    await expect(auth.verifyPhoneOtp('+919876500011', '12')).rejects.toMatchObject({ status: 400 });
  });

  it('creates a brand-new blank profile for an unknown number, mirroring shouldCreateUser', async () => {
    const ref = await auth.verifyPhoneOtp('+910000000000', '123456');
    expect(ref.id).toBeTruthy();
    expect(ref.email).toBeNull();
  });
});

describe('MockAuthRepository — Google & demo', () => {
  let auth: MockAuthRepository;
  beforeEach(() => {
    resetMockDb();
    auth = new MockAuthRepository();
  });

  it('signs in with Google as the demo rider', async () => {
    const ref = await auth.signInWithGoogle();
    expect(ref.email).toBe('rider@fleet.com');
  });

  it('keeps demo email login working (admin account)', async () => {
    const ref = await auth.signIn('admin@fleet.com', '');
    expect(ref.email).toBe('admin@fleet.com');
  });

  it('still rejects an unknown demo email', async () => {
    await expect(auth.signIn('nobody@nowhere.com', '')).rejects.toBeInstanceOf(ApiError);
  });

  it('exposes isMock = true', () => {
    expect(auth.isMock).toBe(true);
    expect(auth.requiresPassword).toBe(false);
  });
});
