import type { CopyKey, TranslateFn } from '../i18n';

/**
 * The ONE rider-facing explanation of how the overdue late fee is counted.
 *
 * Why this is a content module and not copy inlined in a component: a rider
 * meets this rule in at least three places — Home's renew banner, the Return
 * sheet's "Overdue" line, and (once it exists) the Terms & Conditions /
 * Return Policy screen. Those must not be three paraphrases. THE T&C AND
 * RETURN POLICY SCREEN IS NOT BUILT YET; when it is, it should render these
 * same sections verbatim rather than restating them, so the explainer a rider
 * taps on Home and the policy they accepted can never disagree.
 *
 * The rule these sections describe is enforced server-side in
 * apps/backend/src/modules/payments/renewalFee.ts (computeLateRenewalFee's
 * `chargeCurrentDay`) and apps/backend/src/modules/rentals/overdueLateFee.ts.
 * If the maths changes there, this text changes with it.
 *
 * ── On translation ───────────────────────────────────────────────────────
 *
 * The functions below now take `t` and return finished strings, rather than
 * holding the strings themselves. That keeps the "one explanation, many
 * screens" guarantee intact in all three languages: the shared text still
 * lives in exactly one place, it is just the key set rather than the prose.
 *
 * `t` is a parameter and not a hook because these are called from render
 * bodies that already have one, and from InfoHint props that are computed
 * outside a component in at least one call site.
 */

export interface LateFeePolicySection {
  heading: string;
  body: string;
}

export const LATE_FEE_POLICY_TITLE_KEY: CopyKey = 'lateFee.title';

/**
 * `feePerDay` is threaded through rather than hardcoded because the rate is an
 * admin setting (pricing_rules code `late_fee`), and a policy screen quoting a
 * rate the system does not actually charge is worse than one quoting no rate
 * at all. Pass 0 (or omit) and the money examples are left out.
 */
export function lateFeePolicySections(t: TranslateFn, feePerDay = 0): LateFeePolicySection[] {
  // Formatted here rather than inside the dictionary: the rupee symbol and
  // the number's grouping follow the device's region, not the app's language.
  const rate = feePerDay > 0 ? `₹${feePerDay.toFixed(0)}` : null;

  return [
    {
      heading: t('lateFee.lastDay.heading'),
      body: t('lateFee.lastDay.body'),
    },
    {
      heading: t('lateFee.renewing.heading'),
      body: t('lateFee.renewing.body'),
    },
    {
      heading: t('lateFee.returning.heading'),
      body: t('lateFee.returning.body'),
    },
    {
      heading: t('lateFee.oneFee.heading'),
      body: rate ? t('lateFee.oneFee.withRate', { rate }) : t('lateFee.oneFee.noRate'),
    },
  ];
}

/**
 * A worked example, which is the only part of this most riders will actually
 * read. Dates are illustrative and deliberately NOT the rider's own — a
 * generic example survives a rider reading it on a different day, and reading
 * their own live figures back to them in the explainer adds nothing the screen
 * behind it is not already showing.
 */
export function lateFeePolicyExample(t: TranslateFn, feePerDay = 0): string[] {
  const money = (days: number) =>
    feePerDay > 0 ? t('lateFee.example.equals', { amount: `₹${(feePerDay * days).toFixed(0)}` }) : '';
  return [
    t('lateFee.example.intro'),
    t('lateFee.example.renew', { amount: money(2) }),
    t('lateFee.example.return', { amount: money(3) }),
  ];
}
