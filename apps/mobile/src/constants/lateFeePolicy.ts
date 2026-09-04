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
 */

export interface LateFeePolicySection {
  heading: string;
  body: string;
}

export const LATE_FEE_POLICY_TITLE = 'How your late fee is counted';

/**
 * `feePerDay` is threaded through rather than hardcoded because the rate is an
 * admin setting (pricing_rules code `late_fee`), and a policy screen quoting a
 * rate the system does not actually charge is worse than one quoting no rate
 * at all. Pass 0 (or omit) and the money examples are left out.
 */
export function lateFeePolicySections(feePerDay = 0): LateFeePolicySection[] {
  const rate = feePerDay > 0 ? `₹${feePerDay.toFixed(0)}` : null;

  return [
    {
      heading: 'The last day of your plan is yours',
      body: 'Your plan covers its final day in full. The late fee only begins the day AFTER your plan ends.',
    },
    {
      heading: 'Renewing pays for today',
      body: 'When you renew, your new plan starts today — so today is charged as plan time, not as a penalty. '
        + 'Renew on the very first day after your plan ends and you owe no late fee at all.',
    },
    {
      heading: 'Returning uses up today',
      body: 'When you hand the scooter back, you have already ridden it through today, so today is counted. '
        + 'That is why returning always shows one day more than renewing on the same date.',
    },
    {
      heading: 'It is one fee, paid once',
      body: rate
        ? `The rate is ${rate} per day either way. Whichever way you clear it — renewing or paying before a return — `
          + 'it is the same debt, and paying it once settles it for this cycle.'
        : 'The rate is the same either way. Whichever way you clear it — renewing or paying before a return — '
          + 'it is the same debt, and paying it once settles it for this cycle.',
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
export function lateFeePolicyExample(feePerDay = 0): string[] {
  const money = (days: number) => (feePerDay > 0 ? ` = ₹${(feePerDay * days).toFixed(0)}` : '');
  return [
    'Say your plan ended on the 1st and today is the 4th:',
    `· Renew today → 2 days (the 2nd and 3rd)${money(2)}`,
    `· Return today → 3 days (the 2nd, 3rd and 4th)${money(3)}`,
  ];
}
