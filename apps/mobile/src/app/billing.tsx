import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScooterStore } from '../store/useScooterStore';
import { COLORS } from '../constants/theme';
import { CreditCard, Calendar, ShieldCheck, Wallet, ChevronRight, Check } from 'lucide-react-native';

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const { user, payRentBill, addWalletFunds, modifySubscription } = useScooterStore();
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  if (!user) return null;

  const handlePayBill = () => {
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Input Error', 'Please enter a valid amount to pay.');
      return;
    }

    if (amount > user.walletBalance) {
      Alert.alert(
        'Insufficient Funds',
        `Your wallet balance is $${user.walletBalance.toFixed(2)}. Please top up your wallet first.`
      );
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      payRentBill(amount);
      setIsProcessing(false);
      setCheckoutVisible(false);
      setPayAmount('');
      Alert.alert('Payment Successful', 'Thank you! Your lease payment has been registered.');
    }, 1500);
  };

  const handleTopUp = () => {
    setIsProcessing(true);
    setTimeout(() => {
      addWalletFunds(50);
      setIsProcessing(false);
      Alert.alert('Top Up Successful', '$50.00 added to your wallet.');
    }, 1200);
  };

  const selectNewPlan = (planName: string, cost: number) => {
    Alert.alert(
      'Change Subscription Package',
      `Would you like to switch your plan to the ${planName} for $${cost.toFixed(2)}/cycle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm Change', 
          onPress: () => {
            modifySubscription(planName, cost);
            Alert.alert('Subscription Swapped', `Your plan has been updated to the ${planName}.`);
          }
        }
      ]
    );
  };

  const mockPlans = [
    { name: 'Weekly Commuter Lease', cost: 29.00, cycle: 'Week' },
    { name: 'Monthly Premium Lease', cost: 89.00, cycle: 'Month' },
    { name: 'Monthly Pro Heavy Lease', cost: 129.00, cycle: 'Month' }
  ];

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-zinc-950 px-6 py-6">
      
      {/* WALLET & OUTSTANDING BALANCE CARDS */}
      <View className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-emerald-100/30 shadow-sm mb-5">
        <View className="flex-row justify-between items-center mb-4">
          <View className="flex-row items-center">
            <Wallet size={20} color={COLORS.primaryDark} className="mr-2" />
            <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-sm dark:text-emerald-50">
              My Wallet Balance
            </Text>
          </View>
          <Text style={{ color: COLORS.primaryDark }} className="text-xl font-black">
            ${user.walletBalance.toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity 
          onPress={handleTopUp}
          style={{ backgroundColor: COLORS.primaryLight }}
          className="w-full py-3.5 rounded-2xl justify-center items-center mb-2.5 border border-emerald-100"
        >
          <Text style={{ color: COLORS.primaryDark }} className="font-extrabold text-sm">
            Top Up Wallet +$50.00
          </Text>
        </TouchableOpacity>
      </View>

      {/* RENTAL BILL OUTSTANDING INVOICE CARD */}
      <View className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-emerald-100/30 shadow-sm mb-5">
        <View className="flex-row justify-between items-start mb-4">
          <View>
            <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Outstanding Rent Due</Text>
            <Text 
              style={{ color: user.outstandingBalance > 0 ? '#EF4444' : COLORS.primaryDark }} 
              className="text-2xl font-black mt-0.5"
            >
              ${user.outstandingBalance.toFixed(2)}
            </Text>
          </View>
          <View className={`px-2.5 py-1.5 rounded-lg border ${user.outstandingBalance > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <Text className={`text-[10px] font-black uppercase ${user.outstandingBalance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {user.outstandingBalance > 0 ? 'PAST DUE' : 'CLEARED'}
            </Text>
          </View>
        </View>

        {user.outstandingBalance > 0 && (
          <TouchableOpacity 
            onPress={() => setCheckoutVisible(true)}
            style={{ backgroundColor: COLORS.primaryDark }}
            className="w-full py-4 rounded-2xl justify-center items-center shadow-sm"
          >
            <Text className="text-white font-bold text-sm">Pay Rent Bill Now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* PLAN LIMITS & DATES */}
      <View className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-emerald-100/30 shadow-sm mb-5">
        <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-sm dark:text-emerald-50 mb-4">
          Plan & Renewal Cycle
        </Text>

        <View className="flex-row items-center border-b border-slate-100 dark:border-zinc-800 pb-3.5 mb-3.5">
          <Calendar size={18} color={COLORS.primaryDark} className="mr-3" />
          <View>
            <Text className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Automated Deduction Date</Text>
            <Text style={{ color: COLORS.forestDeep }} className="text-sm font-bold mt-0.5 dark:text-emerald-100">
              {user.subscription.autoRenewDate}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center">
          <CreditCard size={18} color={COLORS.primaryDark} className="mr-3" />
          <View>
            <Text className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Payment Instrument</Text>
            <Text style={{ color: COLORS.forestDeep }} className="text-sm font-bold mt-0.5 dark:text-emerald-100">
              {user.paymentMethod}
            </Text>
          </View>
        </View>
      </View>

      {/* SUBSCRIPTION PACKAGES - SWITCHER PANEL */}
      <View className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-emerald-100/30 shadow-sm mb-10">
        <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-sm dark:text-emerald-50 mb-4">
          Upgrade or Switch Lease Packages
        </Text>

        {mockPlans.map((plan) => {
          const isActive = user.subscription.name === plan.name;
          return (
            <TouchableOpacity
              key={plan.name}
              onPress={() => selectNewPlan(plan.name, plan.cost)}
              className={`flex-row justify-between items-center p-3.5 rounded-xl border mb-2.5 ${isActive ? 'bg-emerald-50/50 border-emerald-300 dark:bg-emerald-950/20' : 'bg-slate-50 border-slate-200 dark:bg-zinc-800/40 dark:border-zinc-850'}`}
            >
              <View className="flex-row items-center flex-1 mr-4">
                <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${isActive ? 'border-emerald-600 bg-emerald-600' : 'border-slate-350 bg-white dark:bg-zinc-900'}`}>
                  {isActive && <Check size={12} color="#FFF" />}
                </View>
                <View className="flex-1">
                  <Text style={{ color: COLORS.forestDeep }} className="font-bold text-xs dark:text-emerald-100">{plan.name}</Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">Renewed every {plan.cycle}</Text>
                </View>
              </View>

              <Text style={{ color: COLORS.primaryDark }} className="font-black text-sm">
                ${plan.cost.toFixed(0)} <Text className="text-[10px] font-medium text-slate-400">/{plan.cycle.substring(0,2)}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* CHECKOUT MODAL OVERLAY */}
      <Modal
        visible={checkoutVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckoutVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-white dark:bg-zinc-900 rounded-t-3xl p-6 border-t border-emerald-100" style={{ paddingBottom: 16 + insets.bottom }}>
            
            <View className="flex-row justify-between items-center mb-6">
              <Text style={{ color: COLORS.forestDeep }} className="text-lg font-black dark:text-emerald-50">
                Checkout Lease Payment
              </Text>
              <TouchableOpacity onPress={() => setCheckoutVisible(false)} className="p-2 bg-slate-100 rounded-full">
                <Text style={{ color: COLORS.forestDeep }} className="font-bold text-xs">Close</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Payment Amount</Text>
            <View className="flex-row items-center border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 mb-6 bg-slate-50 dark:bg-zinc-950">
              <Text style={{ color: COLORS.forestDeep }} className="text-lg font-black dark:text-emerald-50 mr-2">$</Text>
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                placeholder="e.g. 45.00"
                keyboardType="numeric"
                className="flex-1 text-lg font-extrabold text-slate-800 dark:text-zinc-200"
              />
            </View>

            {isProcessing ? (
              <ActivityIndicator size="large" color={COLORS.primaryDark} className="py-4" />
            ) : (
              <TouchableOpacity
                onPress={handlePayBill}
                style={{ backgroundColor: COLORS.primaryDark }}
                className="w-full py-4 rounded-2xl justify-center items-center shadow-lg"
              >
                <Text className="text-white font-bold text-base">Pay from Wallet</Text>
              </TouchableOpacity>
            )}

            <Text className="text-center text-[10px] text-slate-400 mt-4 leading-normal">
              Funds will be directly deducted from your active NR wallet balance (${user.walletBalance.toFixed(2)} available).
            </Text>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

    </ScrollView>
  );
}
