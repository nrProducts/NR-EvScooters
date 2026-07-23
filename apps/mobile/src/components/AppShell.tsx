import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Animated, Dimensions, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useUnreadNotificationCount } from '../hooks/useNotifications';
import { Badge } from './ui/Badge';
import { COLORS } from '../constants/theme';
import { KYC_STATUS_LABEL, KYC_STATUS_TONE } from '../constants/status';
import {
  Menu, X, User, LogOut, LayoutDashboard, Users, Bike, CreditCard,
  ArrowLeftRight, BarChart3, Settings, Home, LifeBuoy, Mail, Phone,
  ShieldCheck, ChevronRight, FileCheck, Bell, PackageCheck
} from 'lucide-react-native';

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.8);

interface NavItem {
  label: string;
  icon: any;
  route: string;
}

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, route: '/dashboard' },
  { label: 'Manage Users', icon: Users, route: '/users' },
  { label: 'KYC Review', icon: FileCheck, route: '/kyc-review' },
  { label: 'Manage Vehicles', icon: Bike, route: '/vehicles' },
  { label: 'Pickup Queue', icon: PackageCheck, route: '/bookings-pickup' },
  { label: 'Plans', icon: CreditCard, route: '/plans' },
  { label: 'Assign Vehicles', icon: ArrowLeftRight, route: '/assign' },
  { label: 'Reports', icon: BarChart3, route: '/reports' },
  { label: 'Settings', icon: Settings, route: '/settings' },
];

const USER_NAV: NavItem[] = [
  { label: 'Home', icon: Home, route: '/home' },
  { label: 'My Scooter', icon: Bike, route: '/my-scooter' },
  { label: 'My Plan', icon: CreditCard, route: '/my-plan' },
  { label: 'KYC Verification', icon: ShieldCheck, route: '/kyc' },
  { label: 'Support', icon: LifeBuoy, route: '/support' },
];

interface AppShellProps {
  title: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ title, children }) => {
  const router = useRouter();
  const pathname = usePathname();
  // Identity, roles and sign-out come from the authenticated session.
  const profile = useAuthStore(s => s.profile);
  const signOut = useAuthStore(s => s.signOut);

  // Assigned vehicle, plan and KYC come from GET /users/me — real data.

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const { count: unreadNotifications } = useUnreadNotificationCount();
  const insets = useSafeAreaInsets();

  // Staff = anything other than a plain rider. The server enforces this too;
  // hiding the link is only so riders aren't shown doors they can't open.
  const isAdmin = profile?.is_admin ?? false;
  const isStaff = isAdmin || (profile?.roles ?? []).some(r => r !== 'rider');
  // "My Scooter"/"My Plan" only make sense once a booking exists —
  // pending_payment counts as active, same as confirmed (useHasActiveBooking).
  const hasActiveBooking = profile?.has_active_booking ?? false;
  const riderNav = USER_NAV.filter(
    item => (item.route === '/my-scooter' || item.route === '/my-plan') ? hasActiveBooking : true,
  );
  const navItems = isStaff ? ADMIN_NAV : riderNav;

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 0 : -DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  const handleNavigate = (route: string) => {
    closeDrawer();
    router.push(route as any);
  };

  const handleLogout = () => {
    closeDrawer();
    setProfileOpen(false);
    void signOut().then(() => router.replace('/'));
  };

  // The root layout holds the loading state while the profile is in flight.
  if (!profile) return null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-4 border-b" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: 52, paddingBottom: 14 }}>
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: COLORS.background }}
          >
            <Menu size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold flex-1" numberOfLines={1}>
            {title}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/notifications' as any)}
          className="w-9 h-9 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: COLORS.background }}
          accessibilityRole="button"
          accessibilityLabel={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
        >
          <Bell size={18} color={COLORS.textPrimary} />
          {unreadNotifications > 0 ? (
            <View
              className="absolute top-1 right-1.5 min-w-[16px] h-4 rounded-full items-center justify-center px-1"
              style={{ backgroundColor: COLORS.danger }}
            >
              <Text className="text-white text-[9px] font-black">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setProfileOpen(true)}
          className="w-9 h-9 rounded-full items-center justify-center border"
          style={{ backgroundColor: COLORS.primary + '1A', borderColor: COLORS.primary + '40' }}
        >
          <User size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* SCREEN CONTENT */}
      <View style={{ flex: 1 }}>
        {children}
      </View>

      {/* NAV DRAWER */}
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={closeDrawer}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Animated.View
            style={{
              width: DRAWER_WIDTH,
              backgroundColor: COLORS.card,
              transform: [{ translateX: drawerAnim }],
              paddingTop: 56,
            }}
          >
            <View className="px-5 pb-5 border-b" style={{ borderColor: COLORS.border }}>
              <View className="w-11 h-11 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: COLORS.primary }}>
                <Bike size={22} color="#FFF" />
              </View>
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">NR FleetHub</Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
                {isStaff ? 'Admin Console' : 'Rider App'}
              </Text>
            </View>

            <ScrollView className="flex-1 px-3 pt-3" showsVerticalScrollIndicator={false}>
              {navItems.map(item => {
                const active = pathname === item.route;
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={item.route}
                    onPress={() => handleNavigate(item.route)}
                    className="flex-row items-center px-3.5 py-3 rounded-xl mb-1"
                    style={{ backgroundColor: active ? COLORS.primary + '14' : 'transparent' }}
                  >
                    <Icon size={18} color={active ? COLORS.primary : COLORS.textSecondary} />
                    <Text
                      style={{ color: active ? COLORS.primary : COLORS.textPrimary }}
                      className={`ml-3 text-sm ${active ? 'font-bold' : 'font-medium'}`}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <View className="h-px my-3" style={{ backgroundColor: COLORS.border }} />

              <TouchableOpacity
                onPress={() => { closeDrawer(); setProfileOpen(true); }}
                className="flex-row items-center px-3.5 py-3 rounded-xl mb-1"
              >
                <User size={18} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="ml-3 text-sm font-medium">Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleLogout}
                className="flex-row items-center px-3.5 py-3 rounded-xl mb-6"
              >
                <LogOut size={18} color={COLORS.danger} />
                <Text style={{ color: COLORS.danger }} className="ml-3 text-sm font-bold">Logout</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>

          <TouchableOpacity
            activeOpacity={1}
            onPress={closeDrawer}
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' }}
          />
        </View>
      </Modal>

      {/* PROFILE PANEL */}
      <Modal visible={profileOpen} transparent animationType="slide" onRequestClose={() => setProfileOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 16 + insets.bottom }}>
            <View className="flex-row justify-between items-center mb-5">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">Profile</Text>
              <TouchableOpacity
                onPress={() => setProfileOpen(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View className="items-center mb-5">
              <View className="w-16 h-16 rounded-full items-center justify-center mb-2.5" style={{ backgroundColor: COLORS.primary + '1A' }}>
                <User size={28} color={COLORS.primary} />
              </View>
              <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold">{profile.full_name}</Text>
              <View className="flex-row items-center mt-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: isAdmin ? COLORS.primary + '1A' : COLORS.secondary + '30' }}>
                <ShieldCheck size={12} color={COLORS.primary} />
                <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-bold uppercase tracking-wider ml-1">
                  {isAdmin ? 'Admin' : isStaff ? 'Staff' : 'Rider'}
                </Text>
              </View>
            </View>

            <View className="rounded-2xl p-4 mb-3" style={{ backgroundColor: COLORS.background }}>
              <View className="flex-row items-center mb-3">
                <Mail size={15} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2.5">{profile.email ?? '—'}</Text>
              </View>
              <View className="flex-row items-center">
                <Phone size={15} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-2.5">{profile.phone ?? '—'}</Text>
              </View>
            </View>

            <View className="flex-row gap-3 mb-3">
              <View className="flex-1 rounded-2xl p-3.5" style={{ backgroundColor: COLORS.background }}>
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">Assigned Scooter</Text>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                  {profile.assigned_vehicle ? profile.assigned_vehicle.model : 'None'}
                </Text>
              </View>
              <View className="flex-1 rounded-2xl p-3.5" style={{ backgroundColor: COLORS.background }}>
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-1">Current Plan</Text>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                  {profile.current_plan ? profile.current_plan.name : 'None'}
                </Text>
              </View>
            </View>

            <View className="rounded-2xl p-3.5 flex-row items-center justify-between mb-3" style={{ backgroundColor: COLORS.background }}>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold uppercase tracking-wider">KYC Status</Text>
              <Badge label={KYC_STATUS_LABEL[profile.kyc_status]} tone={KYC_STATUS_TONE[profile.kyc_status]} />
            </View>

            {!isStaff && !profile.can_rent ? (
              <TouchableOpacity
                onPress={() => { setProfileOpen(false); router.push('/kyc'); }}
                accessibilityRole="button"
                className="rounded-2xl p-3.5 flex-row items-center justify-between mb-6"
                style={{ backgroundColor: COLORS.warning + '14' }}
              >
                <Text style={{ color: COLORS.warning }} className="text-[11px] font-bold flex-1 mr-2">
                  Verify your identity to unlock a scooter
                </Text>
                <ChevronRight size={16} color={COLORS.warning} />
              </TouchableOpacity>
            ) : (
              <View className="mb-6" />
            )}

            <TouchableOpacity
              onPress={handleLogout}
              className="w-full py-4 rounded-2xl flex-row justify-center items-center"
              style={{ backgroundColor: COLORS.danger + '12' }}
            >
              <LogOut size={16} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="font-bold text-sm ml-2">Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};
