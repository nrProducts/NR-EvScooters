import { create } from 'zustand';
import { Alert } from 'react-native';

export interface SwapStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  availableSwaps: number;
  totalSlots: number;
  distanceKm: number;
  operatingHours: string;
  isMaintenanceHub: boolean;
}

export interface Telemetry {
  scooterId: string;
  batteryPercent: number;
  rangeKm: number;
  temperatureCc: number;
  odometerKm: number;
  lockState: 'locked' | 'unlocked';
  immobilizedState: 'active' | 'immobilized'; // 'active' means operational, 'immobilized' means remote-killed
}

export interface SubscriptionPlan {
  name: string;
  daysRemaining: number;
  monthlyCost: number;
  autoRenewDate: string;
  billingStatus: 'paid' | 'past_due';
}

export interface MaintenanceTicket {
  id: string;
  scooterId: string;
  category: 'Brake Noise' | 'Battery Draining Fast' | 'Tire Puncture' | 'Other';
  description: string;
  status: 'reported' | 'in_progress' | 'resolved';
  date: string;
}

export interface UserAccount {
  name: string;
  email: string;
  role: 'client' | 'staff'; // customer support or customer
  assignedScooterId: string;
  subscription: SubscriptionPlan;
  outstandingBalance: number;
  walletBalance: number;
  paymentMethod: string;
}

export interface SubscriptionState {
  user: UserAccount | null;
  telemetry: Telemetry;
  stations: SwapStation[];
  tickets: MaintenanceTicket[];
  adminScooterLogs: { [scooterId: string]: Telemetry }; // administrative tracking
  
  // Actions
  login: (email: string) => void;
  logout: () => void;
  setRole: (role: 'client' | 'staff') => void;
  
  // User Actions
  toggleLockState: () => void;
  payRentBill: (amount: number) => void;
  addWalletFunds: (amount: number) => void;
  modifySubscription: (planName: string, monthlyCost: number) => void;
  submitMaintenanceTicket: (category: 'Brake Noise' | 'Battery Draining Fast' | 'Tire Puncture' | 'Other', description: string) => void;
  
  // Admin / Staff Actions
  toggleRemoteImmobilization: (scooterId: string) => void;
  applyBillingPenalty: (scooterId: string, amount: number) => void;
  lockoutVehicle: (scooterId: string) => void;
  overridePricingTier: (scooterId: string, customPrice: number) => void;
}

// Center of Austin: (30.2672, -97.7431)
const AUSTIN_LAT = 30.2672;
const AUSTIN_LNG = -97.7431;

const initialTelemetry: Telemetry = {
  scooterId: 'EV-SUB-8812',
  batteryPercent: 82,
  rangeKm: 65.6,
  temperatureCc: 31.4,
  odometerKm: 1245.8,
  lockState: 'locked',
  immobilizedState: 'active'
};

const initialStations: SwapStation[] = [
  { id: 'SWAP-01', name: 'Downtown Express Swap', latitude: AUSTIN_LAT + 0.0021, longitude: AUSTIN_LNG - 0.0018, availableSwaps: 14, totalSlots: 20, distanceKm: 0.4, operatingHours: '24/7 Open', isMaintenanceHub: false },
  { id: 'SWAP-02', name: 'UT Campus Swapper', latitude: AUSTIN_LAT + 0.0095, longitude: AUSTIN_LNG + 0.0012, availableSwaps: 8, totalSlots: 15, distanceKm: 1.2, operatingHours: '06:00 - 23:00', isMaintenanceHub: false },
  { id: 'SWAP-03', name: 'Zilker Park Swap', latitude: AUSTIN_LAT - 0.0062, longitude: AUSTIN_LNG - 0.0084, availableSwaps: 5, totalSlots: 12, distanceKm: 1.8, operatingHours: '08:00 - 22:00', isMaintenanceHub: false },
  { id: 'HUB-04', name: 'Authorized EV Maintenance Hub', latitude: AUSTIN_LAT - 0.0041, longitude: AUSTIN_LNG + 0.0053, availableSwaps: 12, totalSlots: 15, distanceKm: 0.9, operatingHours: '09:00 - 18:00', isMaintenanceHub: true },
  { id: 'SWAP-05', name: 'Austin South Swap Station', latitude: AUSTIN_LAT - 0.0112, longitude: AUSTIN_LNG + 0.0031, availableSwaps: 18, totalSlots: 25, distanceKm: 2.1, operatingHours: '24/7 Open', isMaintenanceHub: false }
];

export const useScooterStore = create<SubscriptionState>((set, get) => ({
  user: null,
  telemetry: initialTelemetry,
  stations: initialStations,
  tickets: [
    { id: 'TKT-991', scooterId: 'EV-SUB-8812', category: 'Brake Noise', description: 'Left handle brake squeals when applying high pressure.', status: 'resolved', date: '2026-06-12' }
  ],
  
  // High fidelity tracking registry for administrative control
  adminScooterLogs: {
    'EV-SUB-8812': initialTelemetry,
    'EV-SUB-9021': { scooterId: 'EV-SUB-9021', batteryPercent: 12, rangeKm: 9.6, temperatureCc: 44.2, odometerKm: 2311.4, lockState: 'locked', immobilizedState: 'active' },
    'EV-SUB-3049': { scooterId: 'EV-SUB-3049', batteryPercent: 54, rangeKm: 43.2, temperatureCc: 28.1, odometerKm: 984.5, lockState: 'unlocked', immobilizedState: 'immobilized' }
  },

  login: (email: string) => {
    const isStaff = email.toLowerCase().includes('staff') || email.toLowerCase().includes('admin');
    
    set({
      user: {
        name: isStaff ? 'Ops Agent Mark' : 'Daniel K. (Subscriber)',
        email,
        role: isStaff ? 'staff' : 'client',
        assignedScooterId: 'EV-SUB-8812',
        subscription: {
          name: 'Monthly Premium Lease',
          daysRemaining: 12,
          monthlyCost: 89.00,
          autoRenewDate: '2026-07-27',
          billingStatus: 'paid'
        },
        outstandingBalance: 45.00, // outstanding lease dues
        walletBalance: 25.00,
        paymentMethod: 'Visa •••• 9012'
      }
    });
  },

  logout: () => {
    set({ user: null });
  },

  setRole: (role: 'client' | 'staff') => {
    set((state) => {
      if (!state.user) return {};
      return {
        user: { ...state.user, role }
      };
    });
  },

  toggleLockState: () => {
    const isImmobilized = get().telemetry.immobilizedState === 'immobilized';
    if (isImmobilized) {
      Alert.alert('Lock Blocked', 'This vehicle is currently remote-immobilized by Admin. Unlocking is disabled.');
      return;
    }

    set((state) => {
      const nextLock: 'locked' | 'unlocked' = state.telemetry.lockState === 'locked' ? 'unlocked' : 'locked';
      const updatedTelemetry = { ...state.telemetry, lockState: nextLock };
      return {
        telemetry: updatedTelemetry,
        adminScooterLogs: {
          ...state.adminScooterLogs,
          [state.telemetry.scooterId]: updatedTelemetry
        }
      };
    });
  },

  payRentBill: (amount: number) => {
    set((state) => {
      if (!state.user) return {};
      const newBalance = Math.max(0, state.user.outstandingBalance - amount);
      const newWallet = Math.max(0, state.user.walletBalance - (amount > state.user.outstandingBalance ? state.user.outstandingBalance : amount));
      return {
        user: {
          ...state.user,
          outstandingBalance: newBalance,
          walletBalance: newWallet,
          subscription: {
            ...state.user.subscription,
            billingStatus: newBalance === 0 ? 'paid' : state.user.subscription.billingStatus
          }
        }
      };
    });
  },

  addWalletFunds: (amount: number) => {
    set((state) => {
      if (!state.user) return {};
      return {
        user: {
          ...state.user,
          walletBalance: state.user.walletBalance + amount
        }
      };
    });
  },

  modifySubscription: (planName: string, monthlyCost: number) => {
    set((state) => {
      if (!state.user) return {};
      return {
        user: {
          ...state.user,
          subscription: {
            ...state.user.subscription,
            name: planName,
            monthlyCost,
            daysRemaining: 30 // extends to a new 30-day term
          }
        }
      };
    });
  },

  submitMaintenanceTicket: (category, description) => {
    const newTicket: MaintenanceTicket = {
      id: `TKT-${Math.floor(Math.random() * 900) + 100}`,
      scooterId: get().telemetry.scooterId,
      category,
      description,
      status: 'reported',
      date: new Date().toISOString().split('T')[0]
    };

    set((state) => ({
      tickets: [newTicket, ...state.tickets]
    }));
  },

  // ADMIN OPERATIONS
  toggleRemoteImmobilization: (scooterId: string) => {
    set((state) => {
      const currentLog = state.adminScooterLogs[scooterId];
      if (!currentLog) return {};
      
      const nextState: 'active' | 'immobilized' = currentLog.immobilizedState === 'immobilized' ? 'active' : 'immobilized';
      const updatedLog: Telemetry = { 
        ...currentLog, 
        immobilizedState: nextState,
        // If immobilized, automatically force locked
        lockState: nextState === 'immobilized' ? ('locked' as const) : currentLog.lockState
      };
      
      return {
        adminScooterLogs: {
          ...state.adminScooterLogs,
          [scooterId]: updatedLog
        },
        // If this is the active user's scooter, update user's live telemetry too
        telemetry: state.telemetry.scooterId === scooterId ? updatedLog : state.telemetry
      };
    });
  },

  applyBillingPenalty: (scooterId: string, amount: number) => {
    set((state) => {
      // If this is the user's vehicle, add penalty to user outstanding bill
      if (state.user && state.user.assignedScooterId === scooterId) {
        return {
          user: {
            ...state.user,
            outstandingBalance: state.user.outstandingBalance + amount,
            subscription: {
              ...state.user.subscription,
              billingStatus: 'past_due' as const
            }
          }
        };
      }
      return {};
    });
  },

  lockoutVehicle: (scooterId: string) => {
    set((state) => {
      const currentLog = state.adminScooterLogs[scooterId];
      if (!currentLog) return {};
      
      const updatedLog = { ...currentLog, lockState: 'locked' as const, immobilizedState: 'immobilized' as const };
      
      return {
        adminScooterLogs: {
          ...state.adminScooterLogs,
          [scooterId]: updatedLog
        },
        telemetry: state.telemetry.scooterId === scooterId ? updatedLog : state.telemetry,
        // Force past_due if lockout is called
        user: state.user && state.user.assignedScooterId === scooterId ? {
          ...state.user,
          subscription: {
            ...state.user.subscription,
            billingStatus: 'past_due' as const
          }
        } : state.user
      };
    });
  },

  overridePricingTier: (scooterId: string, customPrice: number) => {
    set((state) => {
      if (state.user && state.user.assignedScooterId === scooterId) {
        return {
          user: {
            ...state.user,
            subscription: {
              ...state.user.subscription,
              monthlyCost: customPrice
            }
          }
        };
      }
      return {};
    });
  }
}));
