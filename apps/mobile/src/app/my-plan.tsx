import { Redirect } from 'expo-router';

/**
 * Superseded by billing.tsx, which shows everything this screen used to
 * (current plan) plus payment history, deposit, damage and refund status.
 * Kept as a redirect rather than removed so any existing deep link/bookmark
 * to /my-plan still lands somewhere real.
 */
export default function MyPlanScreen() {
  return <Redirect href="/billing" />;
}
