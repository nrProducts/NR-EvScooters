import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useScooterStore } from '../store/useScooterStore';
import { COLORS } from '../constants/theme';
import { Keypad } from '../components/Keypad';
import { Sparkles, Phone, Mail, ArrowRight, LogOut, CheckCircle, ShieldCheck } from 'lucide-react-native';

export default function LoginScreen() {
  const { login, logout, user } = useScooterStore();
  
  // Login states
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInitialSubmit = () => {
    if (!emailOrPhone.trim()) {
      Alert.alert('Input Error', 'Please enter your mobile phone number or administrative staff email.');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      const isEmail = emailOrPhone.includes('@');
      
      if (isEmail) {
        // Staff Login directly handles role change to 'staff'
        login(emailOrPhone);
      } else {
        // Commuter OTP validation flow
        setIsOtpMode(true);
      }
    }, 1200);
  };

  const handleOtpPress = (digit: string) => {
    if (otp.length < 6) {
      setOtp(prev => prev + digit);
    }
  };

  const handleOtpDelete = () => {
    setOtp(prev => prev.slice(0, -1));
  };

  const handleOtpClear = () => {
    setOtp('');
  };

  const handleOtpVerify = () => {
    if (otp.length < 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit verification code.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // Logs in as client using phone number
      login(`${emailOrPhone}@lease.com`);
    }, 1500);
  };

  const renderAuthGate = () => {
    if (loading) {
      return (
        <View className="flex-1 justify-center items-center py-20">
          <ActivityIndicator size="large" color={COLORS.primaryLight} />
          <Text className="text-emerald-100 font-medium mt-4">Processing secure token...</Text>
        </View>
      );
    }

    if (!isOtpMode) {
      return (
        <View className="w-full">
          <Text className="text-emerald-100/75 text-sm font-medium mb-2">Mobile Phone or Staff Email</Text>
          <View className="flex-row items-center bg-white/10 border border-emerald-800/30 rounded-2xl px-4 py-3.5 mb-6">
            {emailOrPhone.includes('@') ? (
              <Mail size={20} color={COLORS.primaryLight} className="mr-3" />
            ) : (
              <Phone size={20} color={COLORS.primaryLight} className="mr-3" />
            )}
            <TextInput
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              placeholder="e.g. +1 512 555 0199 or admin@nrev.com"
              placeholderTextColor="rgba(207, 255, 220, 0.4)"
              keyboardType="email-address"
              autoCapitalize="none"
              className="flex-1 text-white text-base font-semibold"
            />
          </View>

          <TouchableOpacity
            onPress={handleInitialSubmit}
            style={{ backgroundColor: COLORS.primaryLight }}
            className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-lg shadow-emerald-950/40"
          >
            <Text style={{ color: COLORS.forestDeep }} className="font-bold text-base mr-2">
              Send Verification Pin
            </Text>
            <ArrowRight size={18} color={COLORS.forestDeep} />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="w-full">
        <Text className="text-emerald-100/75 text-center text-sm font-medium mb-6">
          We sent a 6-digit code to {emailOrPhone}. Enter it below.
        </Text>

        {/* OTP Input display boxes */}
        <View className="flex-row justify-between mb-8 px-4">
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const digit = otp[index] || '';
            const isActive = otp.length === index;
            return (
              <View
                key={index}
                style={{
                  borderColor: isActive ? COLORS.primaryLight : 'rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)'
                }}
                className="w-11 h-14 border rounded-xl items-center justify-center"
              >
                <Text className="text-white text-xl font-bold">{digit}</Text>
              </View>
            );
          })}
        </View>

        {/* Custom keypad grid */}
        <Keypad
          onPress={handleOtpPress}
          onDelete={handleOtpDelete}
          onClear={handleOtpClear}
        />

        <View className="flex-row gap-3 mt-6">
          <TouchableOpacity
            onPress={() => {
              setIsOtpMode(false);
              setOtp('');
            }}
            className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl justify-center items-center"
          >
            <Text className="text-white font-semibold">Change Input</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOtpVerify}
            disabled={otp.length < 6}
            style={{ 
              backgroundColor: otp.length === 6 ? COLORS.primaryLight : 'rgba(207, 255, 220, 0.2)' 
            }}
            className="flex-1 py-4 rounded-2xl justify-center items-center"
          >
            <Text 
              style={{ color: otp.length === 6 ? COLORS.forestDeep : 'rgba(37, 61, 44, 0.6)' }} 
              className="font-bold text-base"
            >
              Verify Pin
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView 
      contentContainerStyle={{ flexGrow: 1 }} 
      style={{ backgroundColor: COLORS.forestDeep }}
      className="flex-1"
    >
      <View className="flex-1 px-6 justify-center py-10 items-center">
        
        {/* Brand Logo & Tagline */}
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-3xl bg-emerald-700/40 border border-emerald-500/20 items-center justify-center mb-4">
            <Sparkles size={36} color={COLORS.primaryLight} />
          </View>
          <Text className="text-white text-3xl font-black tracking-tight text-center">
            NR <Text style={{ color: COLORS.primaryLight }}>LeaseHub</Text>
          </Text>
          <Text className="text-emerald-100/60 text-sm font-medium mt-1.5 text-center px-4">
            Long-term EV Scooter subscription and remote vehicle telematics.
          </Text>
        </View>

        {/* Form Body: Authenticating */}
        {renderAuthGate()}

      </View>
    </ScrollView>
  );
}
