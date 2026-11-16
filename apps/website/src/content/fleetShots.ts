/**
 * Real screenshots of the two applications, captured from the actual admin
 * console running against DEMO data (never production data: no real rider,
 * vehicle, payment or business appears in any of these, and the map positions
 * are made up).
 *
 * `src` is relative to /public. Widths/heights are the files' real pixel size,
 * so the browser can reserve space and avoid layout shift.
 *
 * Two deliberate omissions, both because the website does not claim them:
 *  - the "Remote control" (immobilise / lock) panel is hidden on the vehicle
 *    screen, and
 *  - the third-party tracking provider's name is removed from the Bike KMs
 *    screen.
 * Re-capture with the same two omissions if these are ever refreshed.
 */
export interface Shot {
  id: string;
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

const shot = (id: string, file: string, height: number, alt: string, caption: string): Shot => ({
  id,
  src: `/fleet/${file}`,
  alt: `SwapNgo Fleet admin console: ${alt}`,
  caption,
  width: 1440,
  height,
});

export const SHOTS = {
  dashboard: shot(
    "dashboard",
    "admin-dashboard.jpg",
    1060,
    "dashboard with revenue, fleet tracking, live map, battery stations, attendance and leave",
    "Dashboard: revenue, fleet status, live map and what needs attention today",
  ),
  rental: shot(
    "rental",
    "admin-rental-operations.jpg",
    900,
    "Rental Operations screen listing bookings awaiting pickup",
    "Rental Operations: bookings, pickups, active rentals and returns",
  ),
  maintenance: shot(
    "maintenance",
    "admin-maintenance.jpg",
    420,
    "Maintenance screen listing breakdown tickets and their status",
    "Maintenance: issues from report to resolution",
  ),
  liveMap: shot(
    "live-map",
    "admin-live-map.jpg",
    900,
    "Live Map with every vehicle coloured by live, stale, offline or low battery",
    "Live Map: every vehicle on one map, with its battery level",
  ),
  bikeKms: shot(
    "bike-kms",
    "admin-bike-kms.jpg",
    900,
    "Bike KMs screen with kilometres per bike today, over 7 days and over 30 days",
    "Bike KMs: kilometres per bike, with a monthly allowance",
  ),
  vehicleTracking: shot(
    "vehicle-tracking",
    "admin-vehicle-tracking.jpg",
    1130,
    "vehicle detail with live position, battery level, speed and running hours for the last 7 days",
    "Vehicle detail: live position, battery and running hours for the last 7 days",
  ),
  users: shot(
    "users",
    "admin-users.jpg",
    900,
    "rider directory showing KYC, plan and payment status",
    "Users: every rider's KYC, plan and payment status at a glance",
  ),
  revenue: shot(
    "revenue",
    "admin-revenue.jpg",
    900,
    "Revenue overview with gross, net, refunds and deposits held",
    "Revenue: gross, net, refunds and deposits held, with trends",
  ),
  kyc: shot(
    "kyc",
    "admin-kyc-queue.jpg",
    540,
    "KYC queue with approve and reject actions",
    "KYC Queue: review documents, then approve or reject",
  ),
  plans: shot(
    "plans",
    "admin-plans.jpg",
    440,
    "Plans screen with price, duration, deposit and onboarding charge",
    "Plans: price, duration, deposit and onboarding charge, set by you",
  ),
  attendance: shot(
    "attendance",
    "admin-attendance.jpg",
    560,
    "Attendance screen showing who is present, absent or on leave today",
    "Attendance: who is in, absent or on leave today",
  ),
  leave: shot(
    "leave",
    "admin-leave.jpg",
    380,
    "Leave screen with staff requests to approve or reject",
    "Leave: staff requests to approve or reject",
  ),
  notifications: shot(
    "notifications",
    "admin-notifications.jpg",
    790,
    "Notifications screen listing broadcasts and their delivery status",
    "Notifications: every broadcast and whether it was delivered",
  ),
  broadcast: shot(
    "broadcast",
    "admin-broadcast.jpg",
    900,
    "Compose a broadcast dialog with title, audience and message",
    "Broadcasts: push a message to all riders, riders with a scooter, or chosen riders",
  ),
};

export interface ShotGroup {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  shots: Shot[];
}

/** The Admin app page's screenshot tour, in reading order. An odd last shot spans the full width. */
export const ADMIN_GROUPS: ShotGroup[] = [
  {
    id: "operations",
    eyebrow: "Operations",
    title: "Run the day\nfrom one screen.",
    description: "The dashboard, bookings, pickups, returns and maintenance, all in one console.",
    shots: [SHOTS.dashboard, SHOTS.rental, SHOTS.maintenance],
  },
  {
    id: "tracking",
    eyebrow: "Vehicle tracking",
    title: "See every vehicle,\nlive.",
    description:
      "Live map, battery, running hours and kilometres per bike. For vehicles fitted with a supported GPS tracker.",
    shots: [SHOTS.liveMap, SHOTS.bikeKms, SHOTS.vehicleTracking],
  },
  {
    id: "riders-money",
    eyebrow: "Riders and money",
    title: "Know who rides,\nand what they owe.",
    description: "Rider directory, KYC review, revenue and the plans you sell.",
    shots: [SHOTS.users, SHOTS.revenue, SHOTS.kyc, SHOTS.plans],
  },
  {
    id: "team-comms",
    eyebrow: "Team and communication",
    title: "Run your team.\nReach your riders.",
    description: "Attendance and leave for your staff, and push broadcasts to riders with a delivery log.",
    shots: [SHOTS.attendance, SHOTS.leave, SHOTS.notifications, SHOTS.broadcast],
  },
];

/** Flat list, dashboard first. The landing page hero uses the first entry. */
export const ADMIN_SHOTS: Shot[] = ADMIN_GROUPS.flatMap((g) => g.shots);

export const RIDER_SHOTS: Shot[] = [];
