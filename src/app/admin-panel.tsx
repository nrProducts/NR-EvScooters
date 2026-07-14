import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { useScooterStore } from '../store/useScooterStore';
import { COLORS } from '../constants/theme';
import { ShieldCheck, ShieldAlert, Key, Search, Settings, AlertTriangle, Users, Compass, DollarSign } from 'lucide-react-native';

export default function AdminPanelScreen() {
  const { 
    user,
    setRole, 
    adminScooterLogs, 
    toggleRemoteImmobilization, 
    applyBillingPenalty, 
    lockoutVehicle, 
    overridePricingTier 
  } = useScooterStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScooterId, setSelectedScooterId] = useState<string>('EV-SUB-8812');
  const [customPrice, setCustomPrice] = useState('');

  if (!user) return null;

  // Custom mock users matching the dashboard registry
  const mockUsers: { [scooterId: string]: { userName: string; planName: string; overdue: boolean } } = {
    'EV-SUB-8812': { userName: 'Daniel K. (You)', planName: 'Monthly Premium Lease', overdue: user.outstandingBalance > 0 },
    'EV-SUB-9021': { userName: 'Sarah Jenkins', planName: 'Weekly Commuter Lease', overdue: false },
    'EV-SUB-3049': { userName: 'James Miller', planName: 'Monthly Pro Heavy Lease', overdue: true }
  };

  const filteredScooters = Object.keys(adminScooterLogs).filter(id => {
    const query = searchQuery.toLowerCase();
    const uName = mockUsers[id]?.userName.toLowerCase() ?? '';
    return id.toLowerCase().includes(query) || uName.includes(query);
  });

  const selectedScooter = adminScooterLogs[selectedScooterId];

  const handlePriceOverride = () => {
    const price = parseFloat(customPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Input Error', 'Please enter a valid numeric pricing tier.');
      return;
    }
    overridePricingTier(selectedScooterId, price);
    setCustomPrice('');
    Alert.alert('Pricing Overridden', `Monthly rate for ${selectedScooterId} set to $${price.toFixed(2)}.`);
  };

  const handleImmobilizeToggle = () => {
    toggleRemoteImmobilization(selectedScooterId);
    const updated = useScooterStore.getState().adminScooterLogs[selectedScooterId];
    const stateName = updated.immobilizedState === 'immobilized' ? 'IMMOBILIZED' : 'ACTIVE';
    Alert.alert('MQTT Override Sent', `Simulated WebSocket publish: ${selectedScooterId} state set to ${stateName}.`);
  };

  const handlePenalty = () => {
    applyBillingPenalty(selectedScooterId, 15);
    Alert.alert('Penalty Registered', `$15.00 late charge applied to account assigned to ${selectedScooterId}.`);
  };

  const handleLockout = () => {
    lockoutVehicle(selectedScooterId);
    Alert.alert('Remote Lockout Sent', `Over-the-air locking sequence deployed. Motor frozen on ${selectedScooterId}.`);
  };

  return (
    <ScrollView 
      style={{ backgroundColor: COLORS.forestDeep }}
      contentContainerStyle={{ paddingBottom: 40 }}
      className="flex-1 px-6 py-8"
    >
      {/* WEB DESKTOP CONTAINER HEADER */}
      <View className="flex-row justify-between items-center mb-8 pb-4 border-b border-white/10">
        <View>
          <Text className="text-emerald-100/60 text-[10px] font-bold uppercase tracking-widest">NR LEASEHUB CORPORATE</Text>
          <Text className="text-white text-2xl font-black">Fleet Override Dashboard</Text>
        </View>

        <TouchableOpacity
          onPress={() => setRole('client')}
          style={{ backgroundColor: COLORS.primaryLight }}
          className="px-4 py-2.5 rounded-xl flex-row items-center border border-emerald-100"
        >
          <Users size={14} color={COLORS.forestDeep} className="mr-2" />
          <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-xs">
            Client View Sandbox
          </Text>
        </TouchableOpacity>
      </View>

      {/* SEARCH AND GRID SYSTEMS */}
      <View className="bg-white/5 border border-white/10 rounded-3xl p-5 mb-6">
        <View className="flex-row items-center bg-white/10 border border-emerald-800/30 rounded-2xl px-4 py-3.5 mb-5">
          <Search size={18} color={COLORS.primaryLight} className="mr-3" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by User Name or EV Scooter ID..."
            placeholderTextColor="rgba(207, 255, 220, 0.4)"
            className="flex-1 text-white text-sm font-semibold"
          />
        </View>

        {/* Scooter Fleet Cards Grid */}
        <Text className="text-emerald-100/60 text-[10px] font-bold uppercase tracking-wider mb-3 px-1">
          Rented Fleet Registries ({filteredScooters.length})
        </Text>
        
        <View className="flex-row flex-wrap justify-between gap-3">
          {filteredScooters.map(id => {
            const sc = adminScooterLogs[id];
            const isSel = selectedScooterId === id;
            const uInfo = mockUsers[id];
            const isImmob = sc.immobilizedState === 'immobilized';
            const hasOverdueDebt = uInfo?.overdue ?? false;

            return (
              <TouchableOpacity
                key={id}
                onPress={() => setSelectedScooterId(id)}
                className={`w-full p-4 rounded-2xl border flex-row justify-between items-center ${isSel ? 'bg-emerald-850/70 border-emerald-400' : 'bg-white/5 border-white/10'}`}
              >
                <View className="flex-row items-center flex-1 mr-4">
                  <View className={`w-3 h-3 rounded-full mr-3 ${isImmob ? 'bg-red-500 animate-ping' : hasOverdueDebt ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                  <View className="flex-1">
                    <Text className="text-white font-bold text-sm">{id}</Text>
                    <Text className="text-emerald-100/50 text-[10px] mt-0.5">{uInfo?.userName}</Text>
                  </View>
                </View>

                <View className="items-end">
                  <Text className="text-white text-xs font-black">{sc.batteryPercent}% Batt</Text>
                  <Text className={`text-[9px] font-bold mt-0.5 ${isImmob ? 'text-red-400' : hasOverdueDebt ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {isImmob ? 'IMMOBILIZED' : hasOverdueDebt ? 'OUTSTANDING' : 'ACTIVE'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* SELECTED OVERRIDE CONTROLS DRAWER */}
      {selectedScooter && (
        <View className="bg-white rounded-3xl p-5 border border-emerald-100/30 shadow-2xl">
          <View className="flex-row justify-between items-start border-b border-slate-100 pb-4 mb-4">
            <View>
              <Text className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Device Overrides Panel</Text>
              <Text style={{ color: COLORS.forestDeep }} className="text-xl font-black mt-0.5">
                {selectedScooterId} Control Gate
              </Text>
              <Text className="text-slate-450 text-xs mt-0.5 font-medium">
                Subscriber: {mockUsers[selectedScooterId]?.userName}
              </Text>
            </View>

            <View className="flex-row items-center bg-emerald-50 px-2 py-0.5 rounded">
              <View className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1 animate-pulse" />
              <Text style={{ color: COLORS.primaryDark }} className="text-[9px] font-extrabold">IOT LINK</Text>
            </View>
            <View className="items-end bg-slate-50 border border-slate-100 p-2 rounded-xl">
              <Text className="text-slate-400 text-[8px] font-bold uppercase tracking-wider">Telemetry Core</Text>
              <Text style={{ color: COLORS.forestDeep }} className="text-xs font-bold mt-0.5">
                {selectedScooter.odometerKm} km • {selectedScooter.temperatureCc}°C
              </Text>
            </View>
          </View>

          {/* DUAL ACTION TOGGLE REMOTE IMMOBILIZATION */}
          <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-xs uppercase tracking-wider mb-2 px-1">
            Core Security Kill Switch
          </Text>
          
          <View className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex-row items-center justify-between mb-5">
            <View className="flex-1 mr-4">
              <Text style={{ color: COLORS.forestDeep }} className="text-xs font-extrabold">Remote Power Immobilization</Text>
              <Text className="text-slate-450 text-[10px] mt-0.5 leading-normal">
                Cuts ignition signal relays directly over-the-air. The vehicle will instantly lock up and freeze.
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleImmobilizeToggle}
              style={{ 
                backgroundColor: selectedScooter.immobilizedState === 'immobilized' ? '#EF4444' : COLORS.primaryDark 
              }}
              className="px-4 py-2.5 rounded-xl border border-transparent"
            >
              <Text className="text-white font-extrabold text-xs">
                {selectedScooter.immobilizedState === 'immobilized' ? 'Restore Motor' : 'Kill Motor'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* LEASE & BILLING ENFORCEMENT SERVICES */}
          <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-xs uppercase tracking-wider mb-2.5 px-1">
            Lease & Billing Enforcement
          </Text>

          <View className="flex-row flex-wrap gap-2.5 mb-5">
            {/* Penalty */}
            <TouchableOpacity
              onPress={handlePenalty}
              className="flex-1 min-w-[45%] py-3.5 bg-yellow-500 rounded-xl justify-center items-center flex-row"
            >
              <AlertTriangle size={14} color="#FFF" className="mr-1.5" />
              <Text className="text-white font-bold text-xs">Apply Penalty ($15)</Text>
            </TouchableOpacity>

            {/* Lockout */}
            <TouchableOpacity
              onPress={handleLockout}
              className="flex-1 min-w-[45%] py-3.5 bg-red-600 rounded-xl justify-center items-center flex-row"
            >
              <Key size={14} color="#FFF" className="mr-1.5" />
              <Text className="text-white font-bold text-xs">Trigger Lockout</Text>
            </TouchableOpacity>
          </View>

          {/* Pricing Override Panel */}
          <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">Override Lease Pricing Tier</Text>
          <View className="flex-row items-center border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 mb-3.5">
            <DollarSign size={14} color={COLORS.forestDeep} className="mr-1" />
            <TextInput
              value={customPrice}
              onChangeText={setCustomPrice}
              placeholder="Set custom cost (e.g. 75.00)"
              keyboardType="numeric"
              className="flex-1 text-xs font-bold text-slate-700"
            />
            <TouchableOpacity
              onPress={handlePriceOverride}
              style={{ backgroundColor: COLORS.primaryDark }}
              className="px-3.5 py-1.5 rounded-lg"
            >
              <Text className="text-white text-[10px] font-bold">Apply</Text>
            </TouchableOpacity>
          </View>

        </View>
      )}

    </ScrollView>
  );
}
