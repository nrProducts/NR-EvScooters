import type { LucideIcon } from "lucide-react";
import {
  Bike,
  Users,
  CalendarCheck,
  Layers,
  CreditCard,
  Receipt,
  BatteryCharging,
  Wrench,
  LifeBuoy,
  ShieldCheck,
  ClipboardList,
  Truck,
  Car,
  Building2,
  Package,
  Warehouse,
  KeyRound,
  MapPin,
  Gauge,
  Clock,
  Bell,
  UserCheck,
  Smartphone,
  FileText,
  Undo2,
} from "lucide-react";

/**
 * Everything the fleet-software pages say the product does.
 *
 * RULE FOR EDITING THIS FILE: only list what exists, ships and works in
 * apps/web (admin console), apps/mobile (rider app) and apps/backend today.
 * Each line below was checked against a route, screen or service in those
 * apps. Vehicle tracking (live map, battery, running hours, kilometres) is
 * listed WITH its caveat: it needs a supported GPS tracker on the vehicle.
 * Remote immobilise / lock also exist as code but are deliberately NOT listed
 * (their behaviour on a moving vehicle is unverified) — don't add them until
 * they have been checked on a real vehicle.
 */

export interface FeatureCategory {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  items: string[];
}

/** What your team uses: the admin web application. */
export const ADMIN_FEATURES: FeatureCategory[] = [
  {
    id: "fleet",
    icon: Bike,
    title: "Fleet & vehicles",
    summary: "One register for every vehicle you own, who has it, and what state it is in.",
    items: [
      "Vehicle register with status, model and full activity history",
      "Bulk import of vehicles from a spreadsheet",
      "Assign and reassign vehicles to riders",
      "Status changes that end plans or send a vehicle to maintenance",
      "Damage notes recorded against each vehicle",
      "Vehicle model catalogue that bookings are made against",
    ],
  },
  {
    id: "tracking",
    icon: MapPin,
    title: "Vehicle tracking",
    summary: "See where your vehicles are and how hard they are working. For vehicles fitted with a supported GPS tracker.",
    items: [
      "Live map of every vehicle, coloured by live, stale, offline or low battery",
      "Battery level, speed and last-seen time for each vehicle",
      "Running hours and trips for the last 7 days on each vehicle",
      "Kilometres per bike: today, last 7 days and last 30 days",
      "Fleet kilometre allowance with a monthly limit per bike",
      "Staff alerts when a vehicle goes offline or moves with no rider assigned",
    ],
  },
  {
    id: "riders",
    icon: Users,
    title: "Riders & KYC",
    summary: "Know who is riding before they ride, without chasing paperwork.",
    items: [
      "Rider directory with plan, payment and open-return status at a glance",
      "KYC review queue for Aadhaar and driving licence submissions",
      "Original-document verification at handover",
      "Sensitive numbers hidden until a permitted staff member reveals them, with a reason",
      "Internal comment thread on each rider",
      "Referral tracking and reward cards",
    ],
  },
  {
    id: "rentals",
    icon: CalendarCheck,
    title: "Bookings & rentals",
    summary: "From reservation to handover, renewal and return, in one operations view.",
    items: [
      "Rental operations board for bookings, active rentals and returns",
      "Staff can create bookings on a rider's behalf and record offline payments",
      "Return requests with inspection, settlement and deposit refund",
      "Late-fee rules applied consistently on renewal and on return",
      "Cancellation tiers that decide how much of a booking is refunded",
      "Renewals and return rules enforced server-side, not just in the app",
    ],
  },
  {
    id: "plans",
    icon: Layers,
    title: "Plans & pricing rules",
    summary: "Change what you charge without asking a developer.",
    items: [
      "Daily, weekly, monthly and yearly plan cycles",
      "Security deposit and one-time onboarding charge per plan",
      "Plan renewal and return-recovery settings",
      "Configurable charge rules such as transaction fees",
      "Ad-hoc charges for lost keys, fines or damage that riders see and pay in the app",
      "Plans shown to riders update as soon as you change them",
    ],
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "Payments & refunds",
    summary: "Collect online, refund with approval, and reconcile against the gateway.",
    items: [
      "Online payments through Razorpay",
      "Payments ledger with search and filters",
      "Refund requests that need staff approval before money moves",
      "Deposit tracking: what is held and why it is or is not refundable yet",
      "Reconciliation of your records against Razorpay settlements",
      "Revenue reporting with refunds shown alongside",
    ],
  },
  {
    id: "gst",
    icon: Receipt,
    title: "GST & accounting",
    summary: "Invoices and books that your accountant can actually use.",
    items: [
      "GST tax invoices and credit notes issued as payments and refunds happen",
      "Vendor purchases and input tax credit",
      "GSTR-1 and GSTR-3B worksheets with a filing pack",
      "Trial balance, profit and loss, deposit and receivable registers",
      "Tally export",
      "Riders can open their own tax invoices in the app",
    ],
  },
  {
    id: "stations",
    icon: BatteryCharging,
    title: "Battery-swap stations",
    summary: "For EV fleets that run on swappable batteries. Optional if you charge another way.",
    items: [
      "Station directory with map-based location picker",
      "Station status and capacity summary",
      "Riders see nearby stations and directions in the app",
    ],
  },
  {
    id: "maintenance",
    icon: Wrench,
    title: "Maintenance & damages",
    summary: "Keep vehicles on the road, and know who owes what for damage.",
    items: [
      "Maintenance tickets with a triage step",
      "Maintenance history per vehicle",
      "Damage records that feed return settlement and deposit deductions",
    ],
  },
  {
    id: "support",
    icon: LifeBuoy,
    title: "Support & notifications",
    summary: "Answer riders where they already are.",
    items: [
      "Support tickets raised by riders from the app",
      "Broadcast push messages to all riders, riders with a scooter, or chosen riders, with a delivery log",
      "In-app notifications and browser push for the rider web app",
      "Notification manager: choose which alerts are on, by email or in-app, and who receives them",
    ],
  },
  {
    id: "access",
    icon: KeyRound,
    title: "Team, access & audit",
    summary: "Give each person exactly the access their job needs.",
    items: [
      "Permission matrix by module and by action (view, approve, configure…)",
      "Staff accounts managed by an admin",
      "Audit log of sensitive actions",
      "Error log for operations to review",
      "Staff attendance, leave and holiday calendar",
    ],
  },
  {
    id: "compliance",
    icon: ShieldCheck,
    title: "Privacy & compliance",
    summary: "Built with India's data-protection rules in mind.",
    items: [
      "Versioned Terms & Conditions with acceptance recorded at sign-up",
      "Privacy-rights request queue",
      "Log of staff access to riders' personal data",
      "Consent notices and per-rider consent records",
    ],
  },
];

/** What your riders use: the rider mobile application (Android, and in a web browser). */
export const RIDER_FEATURES: FeatureCategory[] = [
  {
    id: "rider-signup",
    icon: UserCheck,
    title: "Sign-up & KYC",
    summary: "Riders get verified from their phone, and your team reviews it in the admin console.",
    items: [
      "Sign in with a phone number (or Google) and complete a short profile",
      "Submit a photo, an emergency contact, Aadhaar number and driving licence",
      "See the KYC review status in the app",
      "Terms & Conditions accepted at sign-up, with the acceptance recorded",
    ],
  },
  {
    id: "rider-booking",
    icon: Bike,
    title: "Choose a vehicle & pay",
    summary: "Browse what you list, pick a plan and pay without visiting an office.",
    items: [
      "Browse the vehicle models you list",
      "Pick one of the plans you have configured",
      "Pay online through Razorpay: payment, deposit and any onboarding charge",
      "Booking history and referral rewards inside the app",
    ],
  },
  {
    id: "rider-ride",
    icon: MapPin,
    title: "My vehicle & stations",
    summary: "Riders always know what they have and where to go next.",
    items: [
      "See the assigned vehicle and active plan",
      "For EV fleets using swap stations: find the nearest station with directions",
    ],
  },
  {
    id: "rider-billing",
    icon: FileText,
    title: "Billing & invoices",
    summary: "Riders see what they owe and why, and pay it in the app.",
    items: [
      "A billing tab with the amount due and payment history",
      "GST tax invoices and credit notes they can open any time",
      "Ad-hoc charges such as a lost key or a fine, shown and payable in the app",
      "Referral rewards that can be applied to an invoice",
    ],
  },
  {
    id: "rider-return",
    icon: Undo2,
    title: "Renew, return & refund",
    summary: "The whole end of a rental, handled in the app.",
    items: [
      "Renew a plan from the app",
      "Request a return, then see the settlement and deposit refund once your team has inspected the vehicle",
      "Return lock: once a return is open, renewals and new bookings are paused so nothing is billed by mistake",
    ],
  },
  {
    id: "rider-help",
    icon: LifeBuoy,
    title: "Support & notifications",
    summary: "Help and updates reach riders where they already are.",
    items: [
      "Raise and track support tickets",
      "In-app notifications, plus browser push in the web version",
      "Broadcasts from your team arrive as notifications",
    ],
  },
  {
    id: "rider-app",
    icon: Smartphone,
    title: "The app itself",
    summary: "Built for Android, and available in a web browser too.",
    items: [
      "Follows the phone's light or dark theme",
      "Privacy centre: view and raise data-rights requests, and name a nominee",
      "Syncs with your admin console, so staff and riders always see the same thing",
    ],
  },
];

export interface Segment {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** The seven customer types from the brief, each with a plain statement of how it fits. */
export const SEGMENTS: Segment[] = [
  { icon: Bike, title: "EV scooter rental companies", description: "The use case it was built and is run for: plans, deposits, KYC, swap stations and returns." },
  { icon: Bike, title: "Bike rental businesses", description: "Rent by the day or week with deposits, handover checks and damage tracking." },
  { icon: Car, title: "Car rental companies", description: "Bookings, riders' documents, recurring payments and GST invoices in one console." },
  { icon: Building2, title: "Vehicle leasing companies", description: "Recurring plans, security deposits, renewals and a clean return and settlement process." },
  { icon: Package, title: "Delivery fleet operators", description: "Onboard delivery partners with KYC, assign vehicles and collect weekly payments." },
  { icon: Truck, title: "Logistics companies", description: "Track which vehicle is with which driver, and keep maintenance and billing organised." },
  { icon: Warehouse, title: "Commercial fleet operators", description: "Role-based staff access, audit trails and accounting exports for larger teams." },
];

export const BENEFITS = [
  { title: "One system instead of five", description: "Bookings, KYC, payments, invoices and support live together, so nobody re-keys data between spreadsheets." },
  { title: "Fewer payment disputes", description: "Riders see what they owe and why, pay in the app, and download a GST invoice. Staff see the same numbers." },
  { title: "Control without bottlenecks", description: "Delegate work to staff by module and action, while refunds and sensitive data stay behind approvals." },
  { title: "Books that are ready sooner", description: "Invoices, credit notes, purchases and GST worksheets are produced as you operate, not at month end." },
  { title: "Safer onboarding", description: "Vehicles are only handed to riders whose KYC has been verified, and that rule is enforced by the system." },
  { title: "Proven in a live fleet", description: "The same software runs Swapngo's own EV scooter rental in Chennai every day." },
];

export interface PricingModel {
  id: "monthly";
  name: string;
  tagline: string;
  cta: string;
  ctaEvent: string;
  suits: string;
  points: string[];
}

export const PRICING_MODELS: PricingModel[] = [
  {
    id: "monthly",
    name: "Monthly Subscription",
    tagline: "Pay as you operate, with a monthly fee that fits your fleet.",
    cta: "Subscribe Monthly",
    ctaEvent: "click_subscribe_monthly",
    suits: "New and growing fleets, and businesses that prefer a predictable monthly expense.",
    points: [
      "A monthly fee based on your fleet size and the modules you use (contact us for details)",
      "Software updates and support while you subscribe",
      "Scale up or down as your fleet changes",
    ],
  },
];



export const BUSINESS_TYPE_OPTIONS = [
  { value: "ev_scooter_rental", label: "EV scooter rental company" },
  { value: "bike_rental", label: "Bike rental business" },
  { value: "car_rental", label: "Car rental company" },
  { value: "vehicle_leasing", label: "Vehicle leasing company" },
  { value: "delivery_fleet", label: "Delivery fleet operator" },
  { value: "logistics", label: "Logistics company" },
  { value: "commercial_fleet", label: "Commercial fleet operator" },
  { value: "other", label: "Other" },
] as const;

export const FLEET_SIZE_OPTIONS = [
  { value: "up_to_10", label: "Up to 10 vehicles" },
  { value: "11_50", label: "11 to 50 vehicles" },
  { value: "51_200", label: "51 to 200 vehicles" },
  { value: "over_200", label: "More than 200 vehicles" },
] as const;

export const PRICING_INTEREST_OPTIONS = [
  { value: "monthly", label: "Monthly subscription" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

export const ADMIN_HIGHLIGHTS = [
  { icon: ClipboardList, title: "Dashboard", description: "Fleet status, revenue and what needs attention today." },
  { icon: CalendarCheck, title: "Rental operations", description: "Bookings, active rentals and returns on one board." },
  { icon: Bike, title: "Vehicles", description: "Register, status, history, damage notes and bulk import." },
  { icon: MapPin, title: "Live map & tracking", description: "Every vehicle on one map, with battery, running hours and kilometres per bike." },
  { icon: ShieldCheck, title: "KYC queue", description: "Review identity documents before a vehicle is handed over." },
  { icon: CreditCard, title: "Payments & refunds", description: "Ledger, refund approvals and deposit tracking." },
  { icon: Receipt, title: "GST & books", description: "Tax invoices, purchases, return worksheets and Tally export." },
  { icon: Clock, title: "Attendance & leave", description: "Staff check-ins, leave requests to approve, and a holiday calendar." },
  { icon: Bell, title: "Notifications & broadcasts", description: "Push a message to your riders and see its delivery status." },
];
