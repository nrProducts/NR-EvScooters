/**
 * Answers are constrained to what the app's own business rules enforce
 * (see docs/users-and-kyc.md, docs/battery-stations.md, and the bookings/
 * payments modules) — nothing here is asserted beyond what the codebase
 * already does.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How do I rent a scooter?",
    answer:
      "Download the SwapNgo app, verify your identity (KYC), choose a plan, and pay online. Once your booking is confirmed, you'll pick up your scooter from your assigned station.",
  },
  {
    question: "What documents are required?",
    answer:
      "A valid government ID and a driving licence are required to complete KYC. Your booking can't be confirmed until KYC is verified — this is enforced end-to-end, not just a form field.",
  },
  {
    question: "How does payment work?",
    answer:
      "Payment is collected in the app when you confirm your booking, alongside a refundable security deposit. If payment isn't completed in time, the reservation is automatically released.",
  },
  {
    question: "How does the security deposit work?",
    answer:
      "A refundable deposit is charged with your first rental period (₹2,000 on the current Weekly Unlimited plan). It's held against damage and is eligible for refund a set number of days after the vehicle is returned in good condition.",
  },
  {
    question: "What happens after I book?",
    answer:
      "You'll get a pickup station and a reminder as your slot approaches. Hand over is confirmed in the app, and your rental period starts from pickup.",
  },
  {
    question: "How long does a rental plan last?",
    answer:
      "The current plan is Weekly Unlimited — a 7-day rental period. Plans and durations are managed centrally, so this page always reflects what's actually on offer.",
  },
  {
    question: "What if my scooter's battery runs low?",
    answer:
      "SwapNgo scooters use swappable batteries — head to any of our battery-swap stations across Chennai and swap in under 2 minutes instead of waiting to charge.",
  },
  {
    question: "How do I contact support?",
    answer: "Reach us using the details in the Contact section below, or through the Support tab in the app once you're signed in.",
  },
];
