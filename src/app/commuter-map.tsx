import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useScooterStore } from '../store/useScooterStore';
import { COLORS } from '../constants/theme';
import { RadialProgress } from '../components/RadialProgress';
import { useRouter } from 'expo-router';
import { 
  Key, 
  Lock, 
  Unlock, 
  MapPin, 
  CreditCard, 
  Wrench, 
  Thermometer, 
  Compass, 
  LogOut, 
  ShieldAlert, 
  Activity 
} from 'lucide-react-native';

export default function UserDashboardScreen() {
  const { user, telemetry, toggleLockState, logout } = useScooterStore();
  const router = useRouter();

  if (!user) return null;

  const handleIgnitionToggle = () => {
    toggleLockState();
  };

  const isLocked = telemetry.lockState === 'locked';
  const isImmobilized = telemetry.immobilizedState === 'immobilized';

  return (
    <ScrollView 
      style={{ backgroundColor: '#F9FAFB' }}
      contentContainerStyle={{ paddingBottom: 40 }}
      className="flex-1"
    >
      {/* HEADER BANNER */}
      <View style={{ backgroundColor: COLORS.forestDeep }} className="px-6 pt-12 pb-8 rounded-b-[32px] shadow-lg">
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-emerald-250 text-xs font-bold uppercase tracking-widest">Active Lease</Text>
            <Text className="text-white text-2xl font-black">{telemetry.scooterId}</Text>
          </View>
          
          <TouchableOpacity 
            onPress={logout}
            className="w-10 h-10 bg-white/10 rounded-full justify-center items-center"
          >
            <LogOut size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Plan Summary Card */}
        <View className="bg-white/10 border border-white/10 rounded-2xl p-4 flex-row justify-between items-center">
          <View>
            <Text className="text-emerald-100/60 text-[10px] font-bold uppercase tracking-wider">Plan Status</Text>
            <Text className="text-white font-extrabold text-sm">{user.subscription.name}</Text>
            <Text className="text-emerald-100 text-xs mt-0.5">{user.subscription.daysRemaining} Days Remaining</Text>
          </View>

          <View className="bg-emerald-700/30 px-3 py-1.5 rounded-lg border border-emerald-500/20">
            <Text className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest">Active</Text>
          </View>
        </View>
      </View>

      {/* BODY PANEL */}
      <View className="px-6 -mt-4">
        
        {/* TELEMETRY RADIAL INDICATOR CONTAINER */}
        <View className="bg-white rounded-3xl p-5 border border-emerald-100/30 shadow-md mb-5 items-center">
          <View className="flex-row justify-between w-full items-center mb-2 px-1">
            <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-xs uppercase tracking-wider">
              Live Vehicle Telemetry
            </Text>
            <View className="flex-row items-center bg-emerald-50 px-2 py-0.5 rounded">
              <View className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1 animate-pulse" />
              <Text style={{ color: COLORS.primaryDark }} className="text-[9px] font-extrabold">IOT LINK</Text>
            </View>
          </View>

          {/* Immobilized Status Warning */}
          {isImmobilized && (
            <View className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex-row items-center mb-4 w-full">
              <ShieldAlert size={20} color="#EF4444" className="mr-2.5 shrink-0" />
              <View className="flex-1">
                <Text className="text-red-700 font-bold text-xs">VEHICLE IMMOBILIZED</Text>
                <Text className="text-red-650 text-[10px] leading-tight mt-0.5">
                  Remote cut-off triggered by Admin. Please complete your subscription payment or contact support.
                </Text>
              </View>
            </View>
          )}

          <RadialProgress 
            percent={telemetry.batteryPercent} 
            range={telemetry.rangeKm}
            isImmobilized={isImmobilized} 
          />

          {/* Remote Ignition Controller Button */}
          <TouchableOpacity
            onPress={handleIgnitionToggle}
            style={{ 
              backgroundColor: isImmobilized 
                ? '#E5E7EB' 
                : isLocked 
                  ? COLORS.primaryDark 
                  : COLORS.primaryMedium 
            }}
            disabled={isImmobilized}
            className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
          >
            {isLocked ? (
              <>
                <Unlock size={18} color="#FFF" className="mr-2" />
                <Text className="text-white font-bold text-base">Unlock Ignition</Text>
              </>
            ) : (
              <>
                <Lock size={18} color="#FFF" className="mr-2" />
                <Text className="text-white font-bold text-base">Lock Ignition</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* METRICS SENSOR TILES */}
        <View className="flex-row justify-between mb-6">
          {/* Odometer */}
          <View className="w-[48%] bg-white rounded-2xl p-4 border border-emerald-100/20 shadow-sm flex-row items-center">
            <Compass size={24} color={COLORS.primaryDark} className="mr-3" />
            <View>
              <Text className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Odometer</Text>
              <Text style={{ color: COLORS.forestDeep }} className="text-sm font-black mt-0.5">
                {telemetry.odometerKm.toLocaleString()} km
              </Text>
            </View>
          </View>

          {/* Core Temp */}
          <View className="w-[48%] bg-white rounded-2xl p-4 border border-emerald-100/20 shadow-sm flex-row items-center">
            <Thermometer size={24} color={COLORS.primaryDark} className="mr-3" />
            <View>
              <Text className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Pack Temp</Text>
              <Text style={{ color: COLORS.forestDeep }} className="text-sm font-black mt-0.5">
                {telemetry.temperatureCc}°C
              </Text>
            </View>
          </View>
        </View>

        {/* SECTION HEADER */}
        <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-sm uppercase tracking-wider mb-3 px-1">
          Platform Navigator
        </Text>

        {/* NAV CARDS GRID */}
        <View className="gap-3">
          {/* Swapping Station Locator Map */}
          <TouchableOpacity
            onPress={() => router.push('/station-map')}
            className="bg-white rounded-2xl p-4 border border-emerald-100/20 shadow-sm flex-row justify-between items-center"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 bg-emerald-50 rounded-xl justify-center items-center mr-3.5">
                <MapPin size={20} color={COLORS.primaryDark} />
              </View>
              <View>
                <Text style={{ color: COLORS.forestDeep }} className="font-bold text-sm">Station Locator Map</Text>
                <Text className="text-slate-400 text-xs mt-0.5">Locate nearest battery swap hubs</Text>
              </View>
            </View>
            <View className="bg-emerald-50 px-2 py-1 rounded">
              <Text style={{ color: COLORS.primaryDark }} className="text-[10px] font-bold">5 Open</Text>
            </View>
          </TouchableOpacity>

          {/* Billing & Subscription */}
          <TouchableOpacity
            onPress={() => router.push('/billing')}
            className="bg-white rounded-2xl p-4 border border-emerald-100/20 shadow-sm flex-row justify-between items-center"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 bg-emerald-50 rounded-xl justify-center items-center mr-3.5">
                <CreditCard size={20} color={COLORS.primaryDark} />
              </View>
              <View>
                <Text style={{ color: COLORS.forestDeep }} className="font-bold text-sm">Subscription & Billing</Text>
                <Text className="text-slate-400 text-xs mt-0.5">Lease bills, upgrades, auto-renewals</Text>
              </View>
            </View>
            {user.outstandingBalance > 0 && (
              <View className="bg-red-100 px-2.5 py-1 rounded">
                <Text className="text-red-700 text-[10px] font-black">${user.outstandingBalance}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Maintenance Ticket and logs */}
          <TouchableOpacity
            onPress={() => router.push('/maintenance')}
            className="bg-white rounded-2xl p-4 border border-emerald-100/20 shadow-sm flex-row justify-between items-center"
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 bg-emerald-50 rounded-xl justify-center items-center mr-3.5">
                <Wrench size={20} color={COLORS.primaryDark} />
              </View>
              <View>
                <Text style={{ color: COLORS.forestDeep }} className="font-bold text-sm">Service & Maintenance Log</Text>
                <Text className="text-slate-400 text-xs mt-0.5">Report brake noise, punctures, or sync errors</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}
