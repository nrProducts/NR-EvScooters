export type VehicleStatus = 'available' | 'assigned' | 'maintenance' | 'charging';
export type VehicleType = 'Scooter';

export interface Vehicle {
  id: string;
  name: string;
  vehicleNumber: string;
  type: VehicleType;
  model: string;
  manufacturer: string;
  batteryPercent: number;
  status: VehicleStatus;
  registrationNumber: string;
  vin?: string;
  lastServiceDate: string;
  nextServiceDue: string;
  assignedUserId: string | null;
}

export type PlanTier = 'daily' | 'weekly' | 'monthly';

export interface Plan {
  id: string;
  tier: PlanTier;
  name: string;
  price: number;
  duration: string;
  maxDistanceKm?: number;
  benefits?: string[];
  active: boolean;
}

export type UserRole = 'admin' | 'user';
export type AccountStatus = 'active' | 'inactive';
export type MembershipStatus = 'active' | 'trial' | 'expired';

export interface FleetUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  assignedVehicleId: string | null;
  planId: string | null;
  membershipStatus: MembershipStatus;
  joinedDate: string;
}

export type ActivityType = 'assignment' | 'unassignment' | 'maintenance' | 'plan' | 'user' | 'vehicle';

export interface ActivityLogEntry {
  id: string;
  message: string;
  timestamp: string;
  type: ActivityType;
}
