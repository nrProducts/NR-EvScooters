import { create } from 'zustand';
import { Vehicle, Plan, FleetUser, ActivityLogEntry, VehicleStatus, AccountStatus } from '../types/fleet';

interface FleetState {
  currentUserId: string | null;
  vehicles: Vehicle[];
  users: FleetUser[];
  plans: Plan[];
  activity: ActivityLogEntry[];

  // Auth
  /**
   * @deprecated Mock-only sign-in. Real authentication is Supabase, via
   * useAuthStore. Kept because nothing else populates currentUserId for the
   * not-yet-migrated rider screens.
   */
  login: (email: string) => boolean;
  logout: () => void;
  /**
   * SHIM. Points the mock store at a local rider row matching the real
   * authenticated user, so home / my-scooter / my-plan keep rendering while
   * they still read fleet mock data. Delete this once those screens are
   * migrated to the API and useFleetStore no longer carries user rows.
   */
  bindAuthUser: (email: string | null) => void;

  // Derived
  getCurrentUser: () => FleetUser | null;
  getVehicleById: (id: string | null | undefined) => Vehicle | null;
  getPlanById: (id: string | null | undefined) => Plan | null;

  // Vehicle CRUD
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => void;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  assignVehicle: (vehicleId: string, userId: string) => void;
  unassignVehicle: (vehicleId: string) => void;

  // User CRUD
  addUser: (user: Omit<FleetUser, 'id'>) => void;
  updateUser: (id: string, updates: Partial<FleetUser>) => void;
  deleteUser: (id: string) => void;
  toggleUserStatus: (id: string) => void;

  // Plan CRUD
  addPlan: (plan: Omit<Plan, 'id'>) => void;
  updatePlan: (id: string, updates: Partial<Plan>) => void;
  deletePlan: (id: string) => void;
  togglePlanActive: (id: string) => void;

  logActivity: (message: string, type: ActivityLogEntry['type']) => void;
}

const initialVehicles: Vehicle[] = [
  {
    id: 'VEH-1001', name: 'Falcon X1', vehicleNumber: 'FX-1001', type: 'Scooter',
    model: 'X1 Pro', manufacturer: 'Voltrix', batteryPercent: 82, status: 'assigned',
    registrationNumber: 'KA-01-AB-1234', vin: 'VX1PRO000123456',
    lastServiceDate: '2026-05-10', nextServiceDue: '2026-08-10', assignedUserId: 'USR-2001'
  },
  {
    id: 'VEH-1002', name: 'Falcon X1', vehicleNumber: 'FX-1002', type: 'Scooter',
    model: 'X1 Pro', manufacturer: 'Voltrix', batteryPercent: 45, status: 'available',
    registrationNumber: 'KA-01-AB-1235', vin: 'VX1PRO000123457',
    lastServiceDate: '2026-04-22', nextServiceDue: '2026-07-22', assignedUserId: null
  },
  {
    id: 'VEH-1003', name: 'Comet S2', vehicleNumber: 'CS-1003', type: 'Scooter',
    model: 'S2', manufacturer: 'Voltrix', batteryPercent: 12, status: 'charging',
    registrationNumber: 'KA-01-AB-1236', vin: 'VS2000000123458',
    lastServiceDate: '2026-03-30', nextServiceDue: '2026-09-30', assignedUserId: null
  },
  {
    id: 'VEH-1004', name: 'Comet S2', vehicleNumber: 'CS-1004', type: 'Scooter',
    model: 'S2', manufacturer: 'Voltrix', batteryPercent: 68, status: 'maintenance',
    registrationNumber: 'KA-01-AB-1237', vin: 'VS2000000123459',
    lastServiceDate: '2026-01-14', nextServiceDue: '2026-07-18', assignedUserId: null
  },
  {
    id: 'VEH-1005', name: 'Falcon X1', vehicleNumber: 'FX-1005', type: 'Scooter',
    model: 'X1 Pro', manufacturer: 'Voltrix', batteryPercent: 91, status: 'assigned',
    registrationNumber: 'KA-01-AB-1238', vin: 'VX1PRO000123460',
    lastServiceDate: '2026-06-02', nextServiceDue: '2026-09-02', assignedUserId: 'USR-2002'
  },
];

const initialPlans: Plan[] = [
  {
    id: 'PLN-DAILY', tier: 'daily', name: 'Daily Rider', price: 4.99,
    duration: '1 Day', maxDistanceKm: 25, active: true
  },
  {
    id: 'PLN-WEEKLY', tier: 'weekly', name: 'Weekly Saver', price: 24.99,
    duration: '7 Days', benefits: ['Free battery swaps', 'Priority support'], active: true
  },
  {
    id: 'PLN-MONTHLY', tier: 'monthly', name: 'Monthly Pro', price: 79.99,
    duration: '30 Days', benefits: ['Unlimited swaps', 'Free maintenance', 'Priority support'], active: true
  },
];

const initialUsers: FleetUser[] = [
  {
    id: 'USR-1000', name: 'Priya Rao', email: 'admin@fleet.com', phone: '+91 90000 10001',
    role: 'admin', status: 'active', assignedVehicleId: null, planId: null,
    membershipStatus: 'active', joinedDate: '2025-11-01'
  },
  {
    id: 'USR-2001', name: 'Rohan Mehta', email: 'rohan.mehta@fleet.com', phone: '+91 90000 20001',
    role: 'user', status: 'active', assignedVehicleId: 'VEH-1001', planId: 'PLN-MONTHLY',
    membershipStatus: 'active', joinedDate: '2026-01-15'
  },
  {
    id: 'USR-2002', name: 'Asha Verma', email: 'asha.verma@fleet.com', phone: '+91 90000 20002',
    role: 'user', status: 'active', assignedVehicleId: 'VEH-1005', planId: 'PLN-WEEKLY',
    membershipStatus: 'active', joinedDate: '2026-02-20'
  },
  {
    id: 'USR-2003', name: 'Karan Singh', email: 'karan.singh@fleet.com', phone: '+91 90000 20003',
    role: 'user', status: 'active', assignedVehicleId: null, planId: 'PLN-DAILY',
    membershipStatus: 'trial', joinedDate: '2026-06-30'
  },
  {
    id: 'USR-2004', name: 'Neha Kulkarni', email: 'neha.kulkarni@fleet.com', phone: '+91 90000 20004',
    role: 'user', status: 'inactive', assignedVehicleId: null, planId: null,
    membershipStatus: 'expired', joinedDate: '2025-12-05'
  },
];

const initialActivity: ActivityLogEntry[] = [
  { id: 'ACT-1', message: 'Rohan Mehta assigned to VEH-1001 (Falcon X1)', timestamp: '2026-07-14 09:12', type: 'assignment' },
  { id: 'ACT-2', message: 'VEH-1004 (Comet S2) entered Maintenance', timestamp: '2026-07-13 16:40', type: 'maintenance' },
  { id: 'ACT-3', message: 'Asha Verma renewed Weekly Saver plan', timestamp: '2026-07-12 11:05', type: 'plan' },
];

const genId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const useFleetStore = create<FleetState>((set, get) => ({
  currentUserId: null,
  vehicles: initialVehicles,
  users: initialUsers,
  plans: initialPlans,
  activity: initialActivity,

  login: (email: string) => {
    const match = get().users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!match || match.status !== 'active') return false;
    set({ currentUserId: match.id });
    return true;
  },

  logout: () => set({ currentUserId: null }),

  bindAuthUser: (email) => {
    if (!email) {
      set({ currentUserId: null });
      return;
    }
    const users = get().users;
    const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    // No mock row for this real account (the usual case against a live
    // Supabase project): fall back to the first rider so the demo screens
    // still have something to show rather than rendering blank.
    const fallback = users.find((u) => u.role === 'user') ?? null;
    set({ currentUserId: (match ?? fallback)?.id ?? null });
  },

  getCurrentUser: () => {
    const { currentUserId, users } = get();
    return users.find(u => u.id === currentUserId) ?? null;
  },

  getVehicleById: (id) => {
    if (!id) return null;
    return get().vehicles.find(v => v.id === id) ?? null;
  },

  getPlanById: (id) => {
    if (!id) return null;
    return get().plans.find(p => p.id === id) ?? null;
  },

  logActivity: (message, type) => {
    set(state => ({
      activity: [{ id: genId('ACT'), message, timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '), type }, ...state.activity]
    }));
  },

  // ---- Vehicle CRUD ----
  addVehicle: (vehicle) => {
    const id = genId('VEH');
    set(state => ({ vehicles: [...state.vehicles, { ...vehicle, id }] }));
    get().logActivity(`Vehicle ${vehicle.vehicleNumber} added to fleet`, 'vehicle');
  },

  updateVehicle: (id, updates) => {
    set(state => ({
      vehicles: state.vehicles.map(v => v.id === id ? { ...v, ...updates } : v)
    }));
  },

  deleteVehicle: (id) => {
    const vehicle = get().vehicles.find(v => v.id === id);
    set(state => ({
      vehicles: state.vehicles.filter(v => v.id !== id),
      users: state.users.map(u => u.assignedVehicleId === id ? { ...u, assignedVehicleId: null } : u)
    }));
    if (vehicle) get().logActivity(`Vehicle ${vehicle.vehicleNumber} removed from fleet`, 'vehicle');
  },

  assignVehicle: (vehicleId, userId) => {
    const vehicle = get().vehicles.find(v => v.id === vehicleId);
    const user = get().users.find(u => u.id === userId);
    if (!vehicle || !user) return;

    set(state => ({
      vehicles: state.vehicles.map(v => v.id === vehicleId ? { ...v, status: 'assigned' as VehicleStatus, assignedUserId: userId } : v),
      users: state.users.map(u => {
        if (u.id === userId) return { ...u, assignedVehicleId: vehicleId };
        // Free up any vehicle this user previously held
        return u;
      })
    }));
    get().logActivity(`${user.name} assigned to ${vehicle.vehicleNumber} (${vehicle.name})`, 'assignment');
  },

  unassignVehicle: (vehicleId) => {
    const vehicle = get().vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    const userId = vehicle.assignedUserId;

    set(state => ({
      vehicles: state.vehicles.map(v => v.id === vehicleId ? { ...v, status: 'available' as VehicleStatus, assignedUserId: null } : v),
      users: state.users.map(u => u.id === userId ? { ...u, assignedVehicleId: null } : u)
    }));
    get().logActivity(`${vehicle.vehicleNumber} unassigned and returned to available pool`, 'unassignment');
  },

  // ---- User CRUD ----
  addUser: (user) => {
    const id = genId('USR');
    set(state => ({ users: [...state.users, { ...user, id }] }));
    get().logActivity(`New user ${user.name} added`, 'user');
  },

  updateUser: (id, updates) => {
    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, ...updates } : u)
    }));
  },

  deleteUser: (id) => {
    const user = get().users.find(u => u.id === id);
    set(state => ({
      users: state.users.filter(u => u.id !== id),
      vehicles: state.vehicles.map(v => v.assignedUserId === id ? { ...v, assignedUserId: null, status: 'available' as VehicleStatus } : v)
    }));
    if (user) get().logActivity(`User ${user.name} removed`, 'user');
  },

  toggleUserStatus: (id) => {
    set(state => ({
      users: state.users.map(u => {
        if (u.id !== id) return u;
        const nextStatus: AccountStatus = u.status === 'active' ? 'inactive' : 'active';
        return { ...u, status: nextStatus };
      })
    }));
  },

  // ---- Plan CRUD ----
  addPlan: (plan) => {
    const id = genId('PLN');
    set(state => ({ plans: [...state.plans, { ...plan, id }] }));
    get().logActivity(`Plan "${plan.name}" created`, 'plan');
  },

  updatePlan: (id, updates) => {
    set(state => ({
      plans: state.plans.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  },

  deletePlan: (id) => {
    const plan = get().plans.find(p => p.id === id);
    set(state => ({
      plans: state.plans.filter(p => p.id !== id),
      users: state.users.map(u => u.planId === id ? { ...u, planId: null } : u)
    }));
    if (plan) get().logActivity(`Plan "${plan.name}" deleted`, 'plan');
  },

  togglePlanActive: (id) => {
    set(state => ({
      plans: state.plans.map(p => p.id === id ? { ...p, active: !p.active } : p)
    }));
  },
}));
