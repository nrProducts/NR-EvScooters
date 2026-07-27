import type {
  ActivityEvent,
  Booking,
  DashboardSummary,
  KycDocument,
  MaintenanceTicket,
  NotificationItem,
  Rider,
  Transaction,
  Vehicle,
  VehicleStatus,
} from "@/types";

// Small seeded PRNG so mock data is stable across renders/reloads within a session.
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function int(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const FIRST_NAMES = [
  "Arun", "Karthik", "Divya", "Priya", "Suresh", "Vignesh", "Meena", "Ramesh",
  "Kavya", "Naveen", "Deepa", "Sathish", "Lakshmi", "Prabhu", "Anitha", "Kiran",
];
const LAST_NAMES = ["Kumar", "Raj", "Prasad", "Selvam", "Murugan", "Iyer", "Pillai", "Nair"];
const AREAS = ["Sholinganallur", "Thoraipakkam", "Perungudi", "Navalur", "Siruseri", "OMR"];
const MODELS = ["Motovolt MVS7", "Motovolt Urban", "Motovolt Pro"];

function randomName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function randomReg(i: number) {
  return `TN${String(int(1, 99)).padStart(2, "0")}AB${String(1000 + i)}`;
}

const VEHICLE_STATUSES: VehicleStatus[] = [
  "available", "booked", "assigned", "charging", "maintenance", "scrap", "offline",
];

export const MOCK_VEHICLES: Vehicle[] = Array.from({ length: 42 }, (_, i) => {
  const status = pick(VEHICLE_STATUSES);
  return {
    id: `veh_${i + 1}`,
    registrationNumber: randomReg(i),
    vin: `MVSVIN${100000 + i}`,
    imei: `86${900000000000 + i}`,
    model: pick(MODELS),
    status,
    batteryPercent: status === "charging" ? int(10, 60) : int(20, 100),
    odometerKm: int(500, 12000),
    lat: 12.85 + rand() * 0.08,
    lng: 80.19 + rand() * 0.08,
    insuranceExpiry: daysAgoISO(-int(30, 300)),
    registrationExpiry: daysAgoISO(-int(60, 700)),
    currentRiderId: status === "booked" || status === "assigned" ? `rider_${int(1, 30)}` : undefined,
    station: pick(AREAS),
    gpsOnline: status !== "offline" && rand() > 0.05,
    addedOn: daysAgoISO(int(10, 200)),
  };
});

export const MOCK_RIDERS: Rider[] = Array.from({ length: 30 }, (_, i) => {
  const kyc = pick(["pending", "approved", "approved", "approved", "rejected"] as const);
  return {
    id: `rider_${i + 1}`,
    name: randomName(),
    phone: `9${int(700000000, 999999999)}`,
    email: rand() > 0.4 ? `${randomName().toLowerCase().replace(" ", ".")}@mail.com` : undefined,
    kycStatus: kyc,
    joinedOn: daysAgoISO(int(5, 250)),
    activeBookingId: rand() > 0.6 ? `bk_${int(1, 40)}` : undefined,
    walletBalance: int(0, 2000),
    totalRides: int(0, 180),
    violations: rand() > 0.85 ? int(1, 3) : 0,
    address: `${pick(AREAS)}, Chennai`,
    emergencyContact: `9${int(700000000, 999999999)}`,
    licenseNumber: `TN${int(10, 99)}${20180000 + i}`,
  };
});

export const MOCK_KYC_DOCS: KycDocument[] = MOCK_RIDERS.filter((r) => r.kycStatus !== "approved").map(
  (r, i) => ({
    id: `kyc_${i + 1}`,
    riderId: r.id,
    riderName: r.name,
    submittedOn: daysAgoISO(int(0, 15)),
    status: r.kycStatus,
    front: "/mock/id-front.jpg",
    back: "/mock/id-back.jpg",
    selfie: "/mock/selfie.jpg",
    rejectionReason: r.kycStatus === "rejected" ? "Document image is blurred / unreadable" : undefined,
  }),
);

const PLANS = ["daily", "weekly", "monthly"] as const;
const BOOKING_STATUSES = ["upcoming", "current", "completed", "cancelled"] as const;
const PLAN_AMOUNT: Record<(typeof PLANS)[number], number> = { daily: 350, weekly: 2200, monthly: 8000 };

export const MOCK_BOOKINGS: Booking[] = Array.from({ length: 40 }, (_, i) => {
  const vehicle = pick(MOCK_VEHICLES);
  const rider = pick(MOCK_RIDERS);
  const plan = pick(PLANS);
  const start = int(0, 30);
  return {
    id: `bk_${i + 1}`,
    vehicleId: vehicle.id,
    vehicleReg: vehicle.registrationNumber,
    riderId: rider.id,
    riderName: rider.name,
    plan,
    startDate: daysAgoISO(start),
    endDate: daysAgoISO(start - (plan === "daily" ? 1 : plan === "weekly" ? 7 : 30)),
    amount: PLAN_AMOUNT[plan],
    status: pick(BOOKING_STATUSES),
  };
});

const ISSUES = [
  "Battery not charging fully",
  "Brake pads worn out",
  "Suspension noise",
  "Headlight not working",
  "Tyre puncture",
  "GPS module offline",
  "Throttle response issue",
];

export const MOCK_MAINTENANCE: MaintenanceTicket[] = Array.from({ length: 18 }, (_, i) => {
  const vehicle = pick(MOCK_VEHICLES);
  const status = pick(["open", "in_progress", "completed"] as const);
  return {
    id: `mt_${i + 1}`,
    vehicleId: vehicle.id,
    vehicleReg: vehicle.registrationNumber,
    issue: pick(ISSUES),
    priority: pick(["low", "medium", "high"] as const),
    status,
    technician: status !== "open" ? pick(FIRST_NAMES) : undefined,
    partsUsed: status === "completed" ? "Brake pad set, coolant" : undefined,
    repairCost: status === "completed" ? int(300, 3500) : undefined,
    reportedOn: daysAgoISO(int(0, 25)),
    resolvedOn: status === "completed" ? daysAgoISO(int(0, 5)) : undefined,
  };
});

export const MOCK_TRANSACTIONS: Transaction[] = Array.from({ length: 60 }, (_, i) => {
  const rider = pick(MOCK_RIDERS);
  return {
    id: `txn_${i + 1}`,
    riderId: rider.id,
    riderName: rider.name,
    amount: pick([350, 2200, 8000, 500, 1000, -350]),
    type: pick(["rental", "deposit", "wallet_recharge", "refund", "penalty"] as const),
    status: pick(["success", "success", "success", "pending", "failed", "refunded"] as const),
    date: daysAgoISO(int(0, 45)),
    invoiceId: `INV-${2000 + i}`,
  };
});

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "ntf_1",
    title: "Monsoon safety advisory",
    message: "Reminder to riders about wet-road braking distance and low-visibility riding.",
    channel: "push",
    audience: "All riders",
    sentOn: daysAgoISO(2),
    status: "sent",
  },
  {
    id: "ntf_2",
    title: "KYC re-verification",
    message: "Please re-upload your driving licence — the previous copy was unreadable.",
    channel: "sms",
    audience: "Pending KYC riders",
    sentOn: daysAgoISO(1),
    status: "sent",
  },
  {
    id: "ntf_3",
    title: "Weekend referral bonus",
    message: "Refer a friend this weekend and both of you get ₹200 wallet credit.",
    channel: "email",
    audience: "All riders",
    scheduledFor: daysAgoISO(-2),
    status: "scheduled",
  },
];

export const MOCK_ACTIVITY: ActivityEvent[] = Array.from({ length: 25 }, (_, i) => {
  const vehicle = pick(MOCK_VEHICLES);
  const type = pick(["ride", "battery", "charging", "kyc", "booking", "alert"] as const);
  const messages: Record<typeof type, string> = {
    ride: `Vehicle ${vehicle.registrationNumber} started a ride`,
    battery: `Vehicle ${vehicle.registrationNumber} battery at ${int(12, 25)}%`,
    charging: `Vehicle ${vehicle.registrationNumber} entered charging station`,
    kyc: `KYC ${pick(["approved", "submitted"])} for ${pick(MOCK_RIDERS).name}`,
    booking: `Booking ${pick(["confirmed", "cancelled"])} for ${vehicle.registrationNumber}`,
    alert: `SOS alert cleared for ${vehicle.registrationNumber}`,
  };
  return {
    id: `act_${i + 1}`,
    message: messages[type],
    type,
    timestamp: daysAgoISO(rand() * 2),
  };
}).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

function countBy<T, K extends string | number>(items: T[], key: (t: T) => K) {
  const map = new Map<K, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export function buildDashboardSummary(): DashboardSummary {
  const statusCounts = countBy(MOCK_VEHICLES, (v) => v.status);
  const kycCounts = countBy(MOCK_RIDERS, (r) => r.kycStatus);

  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(5, 10);
  });

  return {
    vehicles: {
      total: MOCK_VEHICLES.length,
      available: statusCounts.get("available") ?? 0,
      booked: statusCounts.get("booked") ?? 0,
      assigned: statusCounts.get("assigned") ?? 0,
      charging: statusCounts.get("charging") ?? 0,
      maintenance: statusCounts.get("maintenance") ?? 0,
      scrap: statusCounts.get("scrap") ?? 0,
    },
    riders: {
      total: MOCK_RIDERS.length,
      pendingKyc: kycCounts.get("pending") ?? 0,
      approvedKyc: kycCounts.get("approved") ?? 0,
    },
    revenue: {
      today: 18_400,
      thisWeek: 96_200,
      thisMonth: 341_500,
      outstanding: 22_150,
    },
    fleetUtilization: last14Days.map((date) => ({ date, utilization: int(55, 96) })),
    vehicleStatusDistribution: (Object.entries(Object.fromEntries(statusCounts)) as [VehicleStatus, number][]).map(
      ([status, count]) => ({ status, count }),
    ),
    revenueTrend: last14Days.map((date) => ({ date, revenue: int(8000, 24000) })),
    dailyBookings: last14Days.map((date) => ({ date, count: int(4, 22) })),
    weeklyRentals: Array.from({ length: 8 }, (_, i) => ({ week: `W${i + 1}`, count: int(20, 90) })),
    monthlyRentals: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"].map((month) => ({
      month,
      count: int(80, 260),
    })),
    batteryHealthDistribution: [
      { range: "90-100%", count: int(5, 15) },
      { range: "70-89%", count: int(10, 20) },
      { range: "50-69%", count: int(5, 12) },
      { range: "Below 50%", count: int(1, 6) },
    ],
  };
}
