/**
 * Grievance Officer contact (DPDPA s.13 and the DPDP Rules' publication
 * requirement).
 *
 * PLACEHOLDER — NOT REAL YET. Both values must be replaced with a named
 * individual and a monitored mailbox before launch; publishing a role mailbox
 * with nobody behind it is worse than publishing nothing, because it starts
 * the response clock without starting the response.
 *
 * Deliberately separate from constants/support.ts. The grievance channel is a
 * statutory one with a published response period and a tracked reference; the
 * support channel is not, and merging them would quietly bury data complaints
 * in the ordinary ticket queue.
 */
export const GRIEVANCE_OFFICER_NAME = '[Grievance Officer — to be appointed]';
export const GRIEVANCE_OFFICER_EMAIL = 'privacy@swapngo.example';

/**
 * Shown to riders as the period we commit to. Must match what the notice and
 * docs/dpdpa/rights-request-sop.md say, and must be confirmed against the
 * final Rule text — cited periods vary by source. See the legal-review list
 * in docs/dpdpa/README.md.
 */
export const GRIEVANCE_RESPONSE_DAYS = 30;
