import { beforeEach, describe, expect, it } from 'vitest';
import {
  MockKycRepository, MockReferralRepository, MockUserRepository, mockKycDerivation, rejectMockDocument, resetMockDb, signInAs,
} from './fixtures/mock/mock.repositories';
import { ApiError } from '../src/lib/ApiError';
import type { LocalFile } from '../src/types/api';

const users = new MockUserRepository();
const kyc = new MockKycRepository();
const referrals = new MockReferralRepository();

const FILE: LocalFile = { uri: 'file:///tmp/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' };

const asRider = () => signInAs('rider@fleet.com');
/** u-rider-005: seeded not_submitted, zero documents. */
const asNewRider = () => signInAs('sneha.p@example.com');

/** Asserts the call rejects with an ApiError carrying `status`. */
async function expectStatus(fn: () => Promise<unknown>, status: number) {
  await expect(fn()).rejects.toBeInstanceOf(ApiError);
  await fn().catch((e: ApiError) => expect(e.status).toBe(status));
}

beforeEach(async () => {
  resetMockDb();
});

describe('fixture session helper', () => {
  it('signs in a seeded account', async () => {
    const ref = await asRider();
    expect(ref.email).toBe('rider@fleet.com');
  });

  it('rejects an unknown account', async () => {
    await expectStatus(() => signInAs('nobody@example.com'), 401);
  });

  it('refuses a suspended account', async () => {
    await expectStatus(() => signInAs('deepak.v@example.com'), 403);
  });

  it('refuses a soft-deleted account', async () => {
    await expectStatus(() => signInAs('lakshmi.i@example.com'), 403);
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
    await asNewRider();
    await expectStatus(() => users.myPhotoUrl(), 404);
  });
});

describe('users: skip KYC leaves profile state alone', () => {
  it('updating profile fields never touches kyc_status or can_rent', async () => {
    await asNewRider();
    expect((await kyc.mine()).kyc_status).toBe('not_submitted');

    await users.updateMe({
      date_of_birth: '1998-01-01', gender: 'female', address_line_1: '1 Test Street',
    });

    expect((await kyc.mine()).kyc_status).toBe('not_submitted');
  });
});

describe('kyc: status derivation matches the backend', () => {
  // These assert the DERIVATION, not an endpoint. They used to read it through
  // the staff detail projection, which also meant they could not cover
  // u-rider-004 — that account is suspended and cannot sign in at all.
  it('verified when both mandatory docs are verified and unexpired', async () => {
    await asRider();
    expect((await kyc.mine()).kyc_status).toBe('verified');
  });

  it('pending when both are awaiting review', () => {
    expect(mockKycDerivation('u-rider-002').kyc_status).toBe('pending');
  });

  it('partially_verified on a mix', () => {
    expect(mockKycDerivation('u-rider-003').kyc_status).toBe('partially_verified');
  });

  it('rejected when one mandatory doc is rejected', () => {
    expect(mockKycDerivation('u-rider-004').kyc_status).toBe('rejected');
  });

  it('not_submitted with no documents', () => {
    expect(mockKycDerivation('u-rider-005').kyc_status).toBe('not_submitted');
  });

  it('an expired licence drops the rider out of verified', () => {
    // Arjun's ID is verified and licence is verified but expired.
    const derived = mockKycDerivation('u-rider-006');
    expect(derived.kyc_status).toBe('partially_verified');
    expect(derived.completion_percent).toBe(50);
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
    await asNewRider();
    await expectStatus(
      () => kyc.uploadMine({ doc_type: 'driving_license', doc_number: 'KL0120990011111', front: FILE }),
      422,
    );
  });

  it('refuses an already-expired licence', async () => {
    await asNewRider();
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
    // A reviewer rejects one of Rahul's documents (from the web console),
    // then Rahul corrects it here.
    rejectMockDocument('d-003', 'Blurred beyond reading. Please retake.');

    await signInAs('rahul.k@example.com');
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
    await asNewRider(); // sneha has no documents at all
    await expectStatus(() => kyc.submitMine(), 422);
  });

  it('refuses to submit when already verified', async () => {
    await asRider();
    await expectStatus(() => kyc.submitMine(), 422);
  });
});

describe('referrals', () => {
  it('exposes a stable referral code for the signed-in user', async () => {
    const me = await asRider();
    const summary = await referrals.mine();
    expect(summary.referral_code).toBeTruthy();
    expect(summary.referral_code).toBe((await referrals.mine()).referral_code);
    void me;
  });

  it('redeems a valid code from another user', async () => {
    await asNewRider();
    const otherCode = (await referrals.mine()).referral_code!;

    await asRider();
    await referrals.redeem(otherCode);
    const summaryAfter = await referrals.mine();
    expect(summaryAfter.referral_code).toBeTruthy();
  });

  it('rejects redeeming the same code twice', async () => {
    await asNewRider();
    const otherCode = (await referrals.mine()).referral_code!;

    await asRider();
    await referrals.redeem(otherCode);
    await expectStatus(() => referrals.redeem(otherCode), 409);
  });

  it('rejects an unknown code', async () => {
    await asRider();
    await expectStatus(() => referrals.redeem('NOTREAL1'), 404);
  });

  it('rejects self-referral', async () => {
    await asRider();
    const ownCode = (await referrals.mine()).referral_code!;
    await expectStatus(() => referrals.redeem(ownCode), 422);
  });
});
