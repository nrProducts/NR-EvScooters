import { beforeEach, describe, expect, it } from 'vitest';
import {
  MockAuthRepository, MockUserRepository, MockVehicleCatalogRepository, resetMockDb,
} from '../src/services/mock/mock.repositories';
import { ApiError } from '../src/lib/ApiError';

const auth = new MockAuthRepository();
const users = new MockUserRepository();
const catalog = new MockVehicleCatalogRepository();

beforeEach(async () => {
  resetMockDb();
});

describe('MockVehicleCatalogRepository: list', () => {
  it('returns the seeded scooter model', async () => {
    const res = await catalog.list({});
    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0].name).toBe('NR Volt X1');
  });

  it('paginates', async () => {
    const res = await catalog.list({ page: 1, pageSize: 1 });
    expect(res.data.length).toBe(1);
    expect(res.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('filters by category', async () => {
    const res = await catalog.list({ category: 'bike' });
    expect(res.data).toEqual([]);
  });

  it('filters by search term', async () => {
    const match = await catalog.list({ search: 'volt' });
    expect(match.data.length).toBeGreaterThan(0);

    const noMatch = await catalog.list({ search: 'nonexistent-model-xyz' });
    expect(noMatch.data).toEqual([]);
  });
});

describe('MockVehicleCatalogRepository: featured', () => {
  it('returns the seeded featured model', async () => {
    const featured = await catalog.featured();
    expect(featured?.is_featured).toBe(true);
    expect(featured?.name).toBe('NR Volt X1');
  });
});

describe('MockVehicleCatalogRepository: get', () => {
  it('returns full detail for a known id', async () => {
    const featured = await catalog.featured();
    const detail = await catalog.get(featured!.id);
    expect(detail.images.length).toBeGreaterThan(0);
    expect(detail.plans.length).toBeGreaterThan(0);
    expect(detail.availability.status).toBe('available');
  });

  it('throws a 404 ApiError for an unknown id', async () => {
    await expect(catalog.get('does-not-exist')).rejects.toBeInstanceOf(ApiError);
    await catalog.get('does-not-exist').catch((e: ApiError) => expect(e.status).toBe(404));
  });
});

describe('me(): has_active_rental', () => {
  it('is true for a rider with an assigned scooter', async () => {
    await auth.signIn('rider@fleet.com', '');
    const me = await users.me();
    expect(me.has_active_rental).toBe(true);
  });

  it('is false for a rider without an assigned scooter', async () => {
    await auth.signIn('fatima.s@example.com', '');
    const me = await users.me();
    expect(me.has_active_rental).toBe(false);
  });
});
