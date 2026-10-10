import { describe, expect, it } from 'vitest';
import { resolveRootRedirect, type RootRouteState } from '../src/lib/rootRedirect';

const rider: NonNullable<RootRouteState['profile']> = {
  role: 'rider',
  profile_completed: true,
  consent_up_to_date: true,
  terms_up_to_date: true,
  kyc_status: 'verified',
};

const state = (overrides: Partial<RootRouteState> = {}): RootRouteState => ({
  segments: [],
  langChosen: true,
  hasSeenOnboarding: true,
  signedIn: true,
  profile: rider,
  hasSeenKycIntro: false,
  ...overrides,
});

describe('resolveRootRedirect', () => {
  it('sends a signed-in rider from the login surface to home', () => {
    expect(resolveRootRedirect(state({ segments: [] }))).toBe('/home');
    expect(resolveRootRedirect(state({ segments: ['otp-verify'] }))).toBe('/home');
  });

  it('holds position while signed in with no profile yet', () => {
    expect(resolveRootRedirect(state({ segments: ['otp-verify'], profile: null }))).toBeNull();
  });

  it('leaves a rider alone on a rider screen, inside or outside the tab group', () => {
    expect(resolveRootRedirect(state({ segments: ['(tabs)', 'billing'] }))).toBeNull();
    expect(resolveRootRedirect(state({ segments: ['(tabs)'] }))).toBeNull();
    expect(resolveRootRedirect(state({ segments: ['booking', '[modelId]'] }))).toBeNull();
  });

  it('bounces an unknown segment to home', () => {
    expect(resolveRootRedirect(state({ segments: ['nope'] }))).toBe('/home');
  });

  it('asks for the language, then onboarding, before anything else', () => {
    expect(resolveRootRedirect(state({ langChosen: false, hasSeenOnboarding: false }))).toBe('/language');
    expect(resolveRootRedirect(state({ langChosen: false, segments: ['language'] }))).toBeNull();
    expect(resolveRootRedirect(state({ hasSeenOnboarding: false, signedIn: false }))).toBe('/onboarding');
  });

  it('keeps a signed-out user on the login surface', () => {
    const signedOut = { signedIn: false, profile: null };
    expect(resolveRootRedirect(state({ ...signedOut, segments: [] }))).toBeNull();
    expect(resolveRootRedirect(state({ ...signedOut, segments: ['otp-verify'] }))).toBeNull();
    expect(resolveRootRedirect(state({ ...signedOut, segments: ['(tabs)', 'home'] }))).toBe('/');
  });

  it('walks a new rider through profile, consent and the KYC intro in order', () => {
    expect(resolveRootRedirect(state({ profile: { ...rider, profile_completed: false } }))).toBe('/profile-setup');
    expect(resolveRootRedirect(state({ profile: { ...rider, terms_up_to_date: false } }))).toBe('/consent?next=/kyc-intro');
    expect(
      resolveRootRedirect(state({ segments: ['privacy'], profile: { ...rider, consent_up_to_date: false } })),
    ).toBeNull();
    expect(resolveRootRedirect(state({ profile: { ...rider, kyc_status: 'not_submitted' } }))).toBe('/kyc-intro');
    expect(
      resolveRootRedirect(state({ profile: { ...rider, kyc_status: 'not_submitted' }, hasSeenKycIntro: true })),
    ).toBe('/home');
  });

  it('never redirects a staff account (the root layout blocks it instead)', () => {
    expect(resolveRootRedirect(state({ profile: { ...rider, role: 'admin', profile_completed: false } }))).toBeNull();
  });
});
