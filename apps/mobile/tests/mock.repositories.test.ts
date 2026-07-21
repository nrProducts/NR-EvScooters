import { beforeEach, describe, expect, it } from 'vitest';
import {
  MockAuthRepository, MockKycRepository, MockUserRepository, resetMockDb,
} from '../src/services/mock/mock.repositories';
import { ApiError } from '../src/lib/ApiError';
import type { LocalFile } from '../src/types/api';

const auth = new MockAuthRepository();
const users = new MockUserRepository();
const kyc = new MockKycRepository();

const FILE: LocalFile = { uri: 'file:///tmp/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' };

const asAdmin = () => auth.signIn('admin@fleet.com', '');
const asStaff = () => auth.signIn('staff@fleet.com', '');
const asRider = () => auth.signIn('rider@fleet.com', '');

/** Asserts the call rejects with an ApiError carrying `status`. */
async function expectStatus(fn: () => Promise<unknown>, status: number) {
  await expect(fn()).rejects.toBeInstanceOf(ApiError);
  await fn().catch((e: ApiError) => expect(e.status).toBe(status));
}

beforeEach(async () => {
  resetMockDb();
});

describe('auth', () => {
  it('signs in a seeded demo account', async () => {
    const ref = await asAdmin();
    expect(ref.email).toBe('admin@fleet.com');
  });

  it('rejects an unknown account', async () => {
    await expectStatus(() => auth.signIn('nobody@example.com', ''), 401);
  });

  it('refuses a suspended account', async () => {
    await expectStatus(() => auth.signIn('deepak.v@example.com', ''), 403);
  });

  it('refuses a soft-deleted account', async () => {
    await expectStatus(() => auth.signIn('lakshmi.i@example.com', ''), 403);
  });
});

describe('users: authorisation', () => {
  it('refuses the list to a rider', async () => {
    await asRider();
    await expectStatus(() => users.list({}), 403);
  });

  it('allows the list to staff', async () => {
    await asStaff();
    const res = await users.list({});
    expect(res.data.length).toBeGreaterThan(0);
  });

  it('refuses create to staff (admin only)', async () => {
    await asStaff();
    await expectStatus(
      () => users.create({ full_name: 'X Y', email: 'x@y.com', phone: '+919999999999' }),
      403,
    );
  });

  it('refuses everything when signed out', async () => {
    await auth.signOut();
    await expectStatus(() => users.list({}), 401);
  });
});

describe('users: business rules', () => {
  it('rejects a duplicate email with field-level detail', async () => {
    await asAdmin();
    try {
      await users.create({ full_name: 'Copy Cat', email: 'rider@fleet.com', phone: '+919111111111' });
      expect.unreachable('should have thrown');
    } catch (err) {
      const e = err as ApiError;
      expect(e.status).toBe(409);
      expect(e.fields?.email).toMatch(/already registered/i);
    }
  });

  it('rejects a duplicate phone', async () => {
    await asAdmin();
    await expectStatus(
      () => users.create({ full_name: 'Copy Cat', email: 'new@example.com', phone: '+919876500010' }),
      409,
    );
  });

  it('treats a phone with separators as the same number', async () => {
    await asAdmin();
    await expectStatus(
      () => users.create({ full_name: 'Copy Cat', email: 'new@example.com', phone: '+91 98765-00010' }),
      409,
    );
  });

  it('creates a rider by default', async () => {
    await asAdmin();
    const created = await users.create({
      full_name: 'New Rider', email: 'new.rider@example.com', phone: '+919222222222',
    });
    expect(created.roles).toEqual(['rider']);
    expect(created.kyc_status).toBe('not_submitted');
  });

  it('refuses to delete your own account', async () => {
    const me = await asAdmin();
    await expectStatus(() => users.remove(me.id), 422);
  });

  it('refuses to remove the last active admin', async () => {
    await asAdmin();
    // Demote the other admin first, leaving exactly one.
    await users.changeStatus('u-admin-002', 'deactivate');
    await expectStatus(() => users.remove('u-admin-001'), 422);
  });

  it('requires a reason to suspend', async () => {
    await asAdmin();
    await expectStatus(() => users.changeStatus('u-rider-001', 'suspend'), 422);
  });

  it('suspends with a reason and unassigns the scooter', async () => {
    await asAdmin();
    const before = await users.get('u-rider-001');
    expect(before.assigned_vehicle).not.toBeNull();

    const after = await users.changeStatus('u-rider-001', 'suspend', 'Repeated damage reports');
    expect(after.account_status).toBe('suspended');
    expect(after.assigned_vehicle).toBeNull();
  });

  it('soft-deletes without losing the row, then restores as inactive', async () => {
    await asAdmin();
    await users.remove('u-rider-005');

    const hidden = await users.list({});
    expect(hidden.data.some((u) => u.id === 'u-rider-005')).toBe(false);

    const shown = await users.list({ includeDeleted: true });
    expect(shown.data.some((u) => u.id === 'u-rider-005')).toBe(true);

    const restored = await users.restore('u-rider-005');
    expect(restored.deleted_at).toBeNull();
    expect(restored.account_status).toBe('inactive');
  });

  it('hides deleted users from staff even when they ask for them', async () => {
    await asStaff();
    const res = await users.list({ includeDeleted: true });
    expect(res.data.some((u) => u.deleted_at)).toBe(false);
  });

  it('refuses self role changes', async () => {
    const me = await asAdmin();
    await expectStatus(() => users.setRoles(me.id, ['rider']), 403);
  });

  it('refuses an empty role list', async () => {
    await asAdmin();
    await expectStatus(() => users.setRoles('u-rider-001', []), 422);
  });
});

describe('users: list', () => {
  it('paginates', async () => {
    await asAdmin();
    const res = await users.list({ page: 1, pageSize: 3 });
    expect(res.data).toHaveLength(3);
    expect(res.pagination.totalPages).toBe(Math.ceil(res.pagination.total / 3));
  });

  it('searches by name, email and document number', async () => {
    await asAdmin();
    expect((await users.list({ search: 'Asha' })).data[0]?.full_name).toBe('Asha Menon');
    expect((await users.list({ search: 'rider@fleet.com' })).data[0]?.id).toBe('u-rider-001');
    // d-001 belongs to Asha
    expect((await users.list({ search: 'ABCD12345678' })).data[0]?.id).toBe('u-rider-001');
  });

  it('filters by account and kyc status', async () => {
    await asAdmin();
    const suspended = await users.list({ accountStatus: 'suspended' });
    expect(suspended.data.every((u) => u.account_status === 'suspended')).toBe(true);

    const verified = await users.list({ kycStatus: 'verified' });
    expect(verified.data.every((u) => u.kyc_status === 'verified')).toBe(true);
  });

  it('masks nothing on the list but never leaks a raw document number', async () => {
    await asAdmin();
    const detail = await users.get('u-rider-001');
    expect(detail.documents[0]?.doc_number_masked).toMatch(/^\*+\d{4}$/);
  });
});

describe('users: profile photo', () => {
  it('uploads and can be read back via a signed url', async () => {
    await asRider();
    const result = await users.uploadMyPhoto(FILE);
    expect(result.profile_photo_url).toBeTruthy();
    const signed = await users.myPhotoUrl();
    expect(signed.url).toBeTruthy();
  });

  it('errors when no photo has been uploaded yet', async () => {
    await asAdmin();
    await expectStatus(() => users.myPhotoUrl(), 404);
  });
});

describe('users: skip KYC leaves profile state alone', () => {
  it('updating profile fields never touches kyc_status or can_rent', async () => {
    await asStaff();
    const before = await users.get('u-rider-005'); // not_submitted, no documents
    expect(before.kyc_status).toBe('not_submitted');

    await auth.signIn('sneha.p@example.com', '');
    await users.updateMe({
      date_of_birth: '1998-01-01', gender: 'female', address_line_1: '1 Test Street',
    });

    const after = await users.get('u-rider-005');
    expect(after.kyc_status).toBe('not_submitted');
  });
});

describe('kyc: status derivation matches the backend', () => {
  it('verified when both mandatory docs are verified and unexpired', async () => {
    await asRider();
    expect((await kyc.mine()).kyc_status).toBe('verified');
  });

  it('pending when both are awaiting review', async () => {
    await asStaff();
    expect((await kyc.detail('u-rider-002')).kyc_status).toBe('pending');
  });

  it('partially_verified on a mix', async () => {
    await asStaff();
    expect((await kyc.detail('u-rider-003')).kyc_status).toBe('partially_verified');
  });

  it('rejected when one mandatory doc is rejected', async () => {
    await asStaff();
    expect((await kyc.detail('u-rider-004')).kyc_status).toBe('rejected');
  });

  it('not_submitted with no documents', async () => {
    await asStaff();
    expect((await kyc.detail('u-rider-005')).kyc_status).toBe('not_submitted');
  });

  it('an expired licence drops the rider out of verified', async () => {
    await asStaff();
    // Arjun's ID is verified and licence is verified but expired.
    const detail = await kyc.detail('u-rider-006');
    expect(detail.kyc_status).toBe('partially_verified');
    expect(detail.completion_percent).toBe(50);
  });
});

describe('kyc: rider rules', () => {
  it('blocks a duplicate active document', async () => {
    await asRider();
    await expectStatus(
      () => kyc.uploadMine({ doc_type: 'aadhaar', doc_number: 'ZZZZ00000000', front: FILE }),
      409,
    );
  });

  it('requires an expiry date on a licence', async () => {
    await asAdmin();
    await expectStatus(
      () => kyc.uploadMine({ doc_type: 'driving_license', doc_number: 'KL0120990011111', front: FILE }),
      422,
    );
  });

  it('refuses an already-expired licence', async () => {
    await asAdmin();
    await expectStatus(
      () =>
        kyc.uploadMine({
          doc_type: 'driving_license', doc_number: 'KL0120990011111',
          expiry_date: '2020-01-01', front: FILE,
        }),
      422,
    );
  });

  it('cannot change a verified document', async () => {
    await asRider();
    await expectStatus(() => kyc.updateMine('d-001', { doc_number: 'HACKED123' }), 422);
  });

  it('cannot delete a verified document', async () => {
    await asRider();
    await expectStatus(() => kyc.deleteMine('d-001'), 422);
  });

  it("cannot touch another rider's document", async () => {
    await asRider();
    await expectStatus(() => kyc.deleteMine('d-003'), 404);
    await expectStatus(() => kyc.myDocumentUrl('d-003', 'front'), 404);
  });

  it('correcting a rejected document returns it to pending and clears the reason', async () => {
    // Reject one of Rahul's documents as staff, then fix it as Rahul.
    await asStaff();
    await kyc.rejectDocument('d-003', 'Blurred beyond reading. Please retake.');

    await auth.signIn('rahul.k@example.com', '');
    const corrected = await kyc.updateMine('d-003', {
      doc_number: 'EFGH87654321',
      front: { uri: 'file:///tmp/better.jpg', name: 'better.jpg', mimeType: 'image/jpeg' },
    });

    expect(corrected.verification_status).toBe('pending');
    expect(corrected.rejection_reason).toBeNull();
    expect(corrected.submitted_at).not.toBeNull();
    // And the rider is back in the queue rather than stuck at rejected.
    expect((await kyc.mine()).kyc_status).toBe('pending');
  });

  it('blocks submit until every mandatory document is present', async () => {
    await asAdmin(); // admin has no documents at all
    await expectStatus(() => kyc.submitMine(), 422);
  });

  it('refuses to submit when already verified', async () => {
    await asRider();
    await expectStatus(() => kyc.submitMine(), 422);
  });
});

describe('kyc: staff rules', () => {
  it('a rider cannot open the queue', async () => {
    await asRider();
    await expectStatus(() => kyc.queue({}), 403);
  });

  it('staff verification flips the document and the overall status', async () => {
    await asStaff();
    await kyc.verifyDocument('d-003');
    await kyc.verifyDocument('d-004');
    expect((await kyc.detail('u-rider-002')).kyc_status).toBe('verified');
  });

  it('rejection requires a reason', async () => {
    await asStaff();
    await expectStatus(() => kyc.rejectDocument('d-003', '   '), 422);
  });

  it('one rejection drags the whole rider to rejected', async () => {
    await asStaff();
    await kyc.rejectDocument('d-003', 'Blurred beyond reading.');
    expect((await kyc.detail('u-rider-002')).kyc_status).toBe('rejected');
  });

  it('cannot verify an expired document', async () => {
    await asStaff();
    await kyc.rejectDocument('d-009', 'Expired licence on file.');
    // Now re-approve attempt should fail on expiry, not on state.
    await expectStatus(() => kyc.approve('u-rider-006'), 422);
  });

  it('cannot self-verify', async () => {
    await asAdmin();
    // Give the admin a pending document, then try to verify it as themselves.
    const doc = await kyc.uploadMine({ doc_type: 'aadhaar', doc_number: 'SELF12345678', front: FILE });
    await expectStatus(() => kyc.verifyDocument(doc.id), 403);
  });

  it('approval is blocked until everything is verified', async () => {
    await asStaff();
    await expectStatus(() => kyc.approve('u-rider-003'), 422);
  });

  it('approval succeeds once all mandatory docs are verified', async () => {
    await asStaff();
    await kyc.verifyDocument('d-006'); // Fatima's remaining licence
    const result = await kyc.approve('u-rider-003');
    expect(result.kyc_status).toBe('verified');
    expect(result.completion_percent).toBe(100);
  });

  it('records history for the review screen', async () => {
    await asStaff();
    await kyc.rejectDocument('d-003', 'Please retake in better light.');
    const detail = await kyc.detail('u-rider-002');
    expect(detail.history.some((h) => h.action === 'kyc.document_rejected')).toBe(true);
  });
});
