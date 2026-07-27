// ---------------------------------------------------------------------------
// Auth / roles
// ---------------------------------------------------------------------------

export type Role = "admin" | "staff";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  phone?: string;
}

// ---------------------------------------------------------------------------
// Vehicles / fleet
// ---------------------------------------------------------------------------

export type VehicleStatus =
  | "available"
  | "booked"
  | "assigned"
  | "charging"
  | "maintenance"
  | "scrap"
  | "offline";

export interface Vehicle {
  id: string;
  registrationNumber: string; // e.g. TN09AB1234
  vin: string;
  imei: string;
  model: string;
  status: VehicleStatus;
  batteryPercent: number;
  odometerKm: number;
  lat: number;
  lng: number;
  insuranceExpiry: string;
  registrationExpiry: string;
  planId?: string;
  currentRiderId?: string;
  station?: string;
  gpsOnline: boolean;
  addedOn: string;
}

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------

export type KycStatus = "pending" | "approved" | "rejected";

export interface Rider {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  kycStatus: KycStatus;
  joinedOn: string;
  activeBookingId?: string;
  walletBalance: number;
  totalRides: number;
  violations: number;
  address?: string;
  emergencyContact?: string;
  licenseNumber?: string;
}

export interface KycDocument {
  id: string;
  riderId: string;
  riderName: string;
  submittedOn: string;
  status: KycStatus;
  front: string;
  back: string;
  selfie: string;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export type BookingStatus = "upcoming" | "current" | "completed" | "cancelled";
export type RentalPlan = "daily" | "weekly" | "monthly";

export interface Booking {
  id: string;
  vehicleId: string;
  vehicleReg: string;
  riderId: string;
  riderName: string;
  plan: RentalPlan;
  startDate: string;
  endDate: string;
  amount: number;
  status: BookingStatus;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export type MaintenanceStatus = "open" | "in_progress" | "completed";
export type MaintenancePriority = "low" | "medium" | "high";

export interface MaintenanceTicket {
  id: string;
  vehicleId: string;
  vehicleReg: string;
  issue: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  technician?: string;
  partsUsed?: string;
  repairCost?: number;
  reportedOn: string;
  resolvedOn?: string;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentStatus = "success" | "pending" | "failed" | "refunded";

export interface Transaction {
  id: string;
  riderId: string;
  riderName: string;
  amount: number;
  type: "rental" | "deposit" | "wallet_recharge" | "refund" | "penalty";
  status: PaymentStatus;
  date: string;
  invoiceId?: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  channel: "push" | "sms" | "email";
  audience: string;
  scheduledFor?: string;
  sentOn?: string;
  status: "draft" | "scheduled" | "sent";
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  id: string;
  message: string;
  type: "ride" | "battery" | "charging" | "kyc" | "booking" | "alert";
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Dashboard aggregate
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  vehicles: {
    total: number;
    available: number;
    booked: number;
    assigned: number;
    charging: number;
    maintenance: number;
    scrap: number;
  };
  riders: {
    total: number;
    pendingKyc: number;
    approvedKyc: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    outstanding: number;
  };
  fleetUtilization: { date: string; utilization: number }[];
  vehicleStatusDistribution: { status: VehicleStatus; count: number }[];
  revenueTrend: { date: string; revenue: number }[];
  dailyBookings: { date: string; count: number }[];
  weeklyRentals: { week: string; count: number }[];
  monthlyRentals: { month: string; count: number }[];
  batteryHealthDistribution: { range: string; count: number }[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
