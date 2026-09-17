import { describe, expect, it } from 'vitest';
import { resolveNotificationRoute } from '../src/lib/notificationRoute';

describe('resolveNotificationRoute', () => {
  it('opens known rider screens', () => {
    expect(resolveNotificationRoute('billing')).toBe('/billing');
    expect(resolveNotificationRoute('home')).toBe('/home');
    expect(resolveNotificationRoute('booking-history')).toBe('/booking-history');
    expect(resolveNotificationRoute('support')).toBe('/support');
  });

  it('tolerates slashes, whitespace and case', () => {
    expect(resolveNotificationRoute('/kyc')).toBe('/kyc');
    expect(resolveNotificationRoute(' My-Scooter/ ')).toBe('/my-scooter');
  });

  it('maps values already stored on sent notifications', () => {
    expect(resolveNotificationRoute('payments')).toBe('/billing');
    expect(resolveNotificationRoute('post-booking-dashboard')).toBe('/my-scooter');
    expect(resolveNotificationRoute('booking/billing')).toBe('/billing');
    expect(resolveNotificationRoute('my-plan')).toBe('/billing');
  });

  it('refuses anything that is not a rider route', () => {
    expect(resolveNotificationRoute('/bookings/returns/abc')).toBeNull();
    expect(resolveNotificationRoute('/damages')).toBeNull();
    expect(resolveNotificationRoute('booking/some-model')).toBeNull();
    expect(resolveNotificationRoute('does-not-exist')).toBeNull();
  });

  it('refuses empty and non-string values', () => {
    expect(resolveNotificationRoute(undefined)).toBeNull();
    expect(resolveNotificationRoute(null)).toBeNull();
    expect(resolveNotificationRoute('')).toBeNull();
    expect(resolveNotificationRoute('  / ')).toBeNull();
    expect(resolveNotificationRoute(42)).toBeNull();
  });

  it('drops query strings and allows a station deep link', () => {
    expect(resolveNotificationRoute('billing?x=1')).toBe('/billing');
    expect(resolveNotificationRoute('battery-stations/abc-123')).toBe('/battery-stations/abc-123');
    expect(resolveNotificationRoute('battery-stations/../kyc')).toBeNull();
  });
});
