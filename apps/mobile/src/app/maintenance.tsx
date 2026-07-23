import React, { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useScooterStore } from '../store/useScooterStore';
import { COLORS } from '../constants/theme';
import { Wrench, Calendar, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react-native';

type DiagnosticCategory = 'Brake Noise' | 'Battery Draining Fast' | 'Tire Puncture' | 'Other';

export default function MaintenanceScreen() {
  const { tickets, submitMaintenanceTicket } = useScooterStore();
  const [selectedCategory, setSelectedCategory] = useState<DiagnosticCategory>('Brake Noise');
  const [ticketDetails, setTicketDetails] = useState('');

  const handleSubmit = () => {
    if (!ticketDetails.trim()) {
      Alert.alert('Form Empty', 'Please provide a short explanation of the diagnostic issue.');
      return;
    }

    submitMaintenanceTicket(selectedCategory, ticketDetails);
    setTicketDetails('');
    Alert.alert('Ticket Submitted', 'Our customer support team is dispatched to analyze the report.');
  };

  const categories: DiagnosticCategory[] = ['Brake Noise', 'Battery Draining Fast', 'Tire Puncture', 'Other'];

  const getStatusBadge = (status: string) => {
    if (status === 'resolved') {
      return (
        <View className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 px-2 py-0.5 rounded flex-row items-center">
          <CheckCircle2 size={10} color={COLORS.primaryDark} className="mr-1" />
          <Text style={{ color: COLORS.primaryDark }} className="text-[9px] font-black uppercase">Resolved</Text>
        </View>
      );
    }
    if (status === 'in_progress') {
      return (
        <View className="bg-amber-50 dark:bg-amber-950/20 border border-amber-250 px-2 py-0.5 rounded flex-row items-center">
          <AlertTriangle size={10} color={COLORS.primaryMedium} className="mr-1" />
          <Text style={{ color: COLORS.primaryMedium }} className="text-[9px] font-black uppercase">Pending Tech</Text>
        </View>
      );
    }
    return (
      <View className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded flex-row items-center">
        <Text className="text-slate-500 text-[9px] font-black uppercase">Reported</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F9FAFB' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView
      style={{ backgroundColor: '#F9FAFB' }}
      contentContainerStyle={{ paddingBottom: 40 }}
      className="flex-1 px-6 py-6"
      keyboardShouldPersistTaps="handled"
    >
      {/* TICKET REPORTING BOX */}
      <View className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-emerald-100/30 shadow-sm mb-6">
        <View className="flex-row items-center mb-4">
          <Wrench size={18} color={COLORS.primaryDark} className="mr-2" />
          <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-sm dark:text-emerald-50">
            Open Maintenance Ticket
          </Text>
        </View>

        {/* Categories selector */}
        <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">Select Issue Category</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {categories.map((cat) => {
            const isSel = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={{ 
                  backgroundColor: isSel ? COLORS.primaryDark : '#F1F5F9',
                }}
                className="px-3 py-2 rounded-xl"
              >
                <Text 
                  style={{ color: isSel ? '#FFF' : COLORS.forestDeep }}
                  className="text-xs font-semibold"
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Explain details */}
        <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">Diagnostic Explanation</Text>
        <View className="border border-slate-200 dark:border-zinc-800 rounded-2xl p-3 bg-slate-50 dark:bg-zinc-950 mb-5 min-h-[90px]">
          <TextInput
            value={ticketDetails}
            onChangeText={setTicketDetails}
            placeholder="e.g. The rear wheel seems loose when riding over bumps, or there is clicking noise..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            className="flex-1 text-slate-700 dark:text-zinc-200 text-xs leading-normal"
          />
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          style={{ backgroundColor: COLORS.primaryDark }}
          className="w-full py-4 rounded-xl flex-row justify-center items-center shadow-md shadow-emerald-950/20"
        >
          <Text className="text-white font-bold text-sm mr-1">Submit Ticket</Text>
          <ArrowRight size={16} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* SERVICE HISTORY LOGS */}
      <View className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-emerald-100/30 shadow-sm">
        <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-sm dark:text-emerald-50 mb-4">
          Diagnostic & Repair History
        </Text>

        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          scrollEnabled={false} // wrapper is ScrollView
          ListEmptyComponent={() => (
            <Text className="text-center text-slate-400 text-xs py-6 font-medium">No previous service logs recorded.</Text>
          )}
          renderItem={({ item }) => (
            <View className="border-b border-slate-100 dark:border-zinc-800/60 py-3.5 flex-row justify-between items-start">
              <View className="flex-1 mr-4">
                <Text style={{ color: COLORS.forestDeep }} className="font-bold text-xs dark:text-emerald-100">
                  {item.category}
                </Text>
                <Text className="text-slate-450 text-[10px] mt-0.5 leading-normal">{item.description}</Text>
                <View className="flex-row items-center mt-2">
                  <Calendar size={10} color="#9CA3AF" className="mr-1" />
                  <Text className="text-slate-400 text-[9px] font-bold">{item.date} • ID: {item.id}</Text>
                </View>
              </View>

              {getStatusBadge(item.status)}
            </View>
          )}
        />
      </View>

    </ScrollView>
    </KeyboardAvoidingView>
  );
}
