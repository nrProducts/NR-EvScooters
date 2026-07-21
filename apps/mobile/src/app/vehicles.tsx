import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import {
  Search, Plus, Bike, BatteryFull, Battery, BatteryLow, Wrench,
  Pencil, Trash2, X, Link2, Unlink, User as UserIcon, Check, SlidersHorizontal,
} from 'lucide-react-native';
import { Vehicle, VehicleStatus } from '../types/fleet';

const STATUS_TONE: Record<VehicleStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  assigned: 'neutral',
  charging: 'warning',
  maintenance: 'danger',
};

const FILTERS: { key: 'all' | VehicleStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'charging', label: 'Charging' },
  { key: 'maintenance', label: 'Maintenance' },
];

const EDITABLE_STATUSES: VehicleStatus[] = ['available', 'charging', 'maintenance'];

function batteryIcon(percent: number) {
  if (percent < 25) return BatteryLow;
  if (percent < 70) return Battery;
  return BatteryFull;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface VehicleFormState {
  name: string;
  vehicleNumber: string;
  manufacturer: string;
  model: string;
  registrationNumber: string;
  vin: string;
  batteryPercent: string;
  status: VehicleStatus;
  lastServiceDate: string;
  nextServiceDue: string;
}

const emptyForm: VehicleFormState = {
  name: '',
  vehicleNumber: '',
  manufacturer: '',
  model: '',
  registrationNumber: '',
  vin: '',
  batteryPercent: '100',
  status: 'available',
  lastServiceDate: todayStr(),
  nextServiceDue: plusDays(90),
};

function FormField({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View className="mb-3.5">
      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider mb-1.5">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        className="rounded-xl px-3.5 py-3 text-sm font-semibold border"
        style={{ backgroundColor: COLORS.background, borderColor: COLORS.border, color: COLORS.textPrimary }}
      />
    </View>
  );
}

export default function VehiclesScreen() {
  const vehicles = useFleetStore(s => s.vehicles);
  const users = useFleetStore(s => s.users);
  const addVehicle = useFleetStore(s => s.addVehicle);
  const updateVehicle = useFleetStore(s => s.updateVehicle);
  const deleteVehicle = useFleetStore(s => s.deleteVehicle);
  const assignVehicle = useFleetStore(s => s.assignVehicle);
  const unassignVehicle = useFleetStore(s => s.unassignVehicle);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatus>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleFormState>(emptyForm);

  const [assignTarget, setAssignTarget] = useState<Vehicle | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter(v => {
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.vehicleNumber.toLowerCase().includes(q) ||
        v.registrationNumber.toLowerCase().includes(q) ||
        v.manufacturer.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        v.status.includes(q)
      );
    });
  }, [vehicles, query, statusFilter]);

  const unassignedUsers = users.filter(u => u.role === 'user' && u.status === 'active' && !u.assignedVehicleId);

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEditForm = (v: Vehicle) => {
    setEditingId(v.id);
    setForm({
      name: v.name,
      vehicleNumber: v.vehicleNumber,
      manufacturer: v.manufacturer,
      model: v.model,
      registrationNumber: v.registrationNumber,
      vin: v.vin ?? '',
      batteryPercent: String(v.batteryPercent),
      status: v.status === 'assigned' ? 'assigned' : v.status,
      lastServiceDate: v.lastServiceDate,
      nextServiceDue: v.nextServiceDue,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
  };

  const handleSubmit = () => {
    const name = form.name.trim();
    const vehicleNumber = form.vehicleNumber.trim();
    const manufacturer = form.manufacturer.trim();
    const model = form.model.trim();
    const registrationNumber = form.registrationNumber.trim();
    const battery = Number(form.batteryPercent);

    if (!name || !vehicleNumber || !manufacturer || !model || !registrationNumber) {
      Alert.alert('Missing details', 'Please fill in name, vehicle number, manufacturer, model, and registration number.');
      return;
    }
    if (Number.isNaN(battery) || battery < 0 || battery > 100) {
      Alert.alert('Invalid battery %', 'Battery percentage must be a number between 0 and 100.');
      return;
    }

    if (editingId) {
      updateVehicle(editingId, {
        name, vehicleNumber, manufacturer, model, registrationNumber,
        vin: form.vin.trim() || undefined,
        batteryPercent: battery,
        status: form.status,
        lastServiceDate: form.lastServiceDate.trim(),
        nextServiceDue: form.nextServiceDue.trim(),
      });
    } else {
      addVehicle({
        name, vehicleNumber, manufacturer, model, registrationNumber,
        vin: form.vin.trim() || undefined,
        batteryPercent: battery,
        status: form.status === 'assigned' ? 'available' : form.status,
        type: 'Scooter',
        lastServiceDate: form.lastServiceDate.trim() || todayStr(),
        nextServiceDue: form.nextServiceDue.trim() || plusDays(90),
        assignedUserId: null,
      });
    }
    closeForm();
  };

  const handleDelete = (v: Vehicle) => {
    Alert.alert(
      'Remove vehicle',
      `Remove ${v.name} (${v.vehicleNumber}) from the fleet? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteVehicle(v.id) },
      ]
    );
  };

  const handleUnassign = (v: Vehicle) => {
    Alert.alert('Unassign vehicle', `Unassign ${v.vehicleNumber} and return it to the available pool?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unassign', onPress: () => unassignVehicle(v.id) },
    ]);
  };

  const handlePickRider = (userId: string) => {
    if (!assignTarget) return;
    assignVehicle(assignTarget.id, userId);
    setAssignTarget(null);
  };

  return (
    <AppShell title="Manage Vehicles">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">Vehicle Fleet</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
              {filtered.length} of {vehicles.length} scooters
            </Text>
          </View>
          <TouchableOpacity
            onPress={openAddForm}
            className="flex-row items-center px-3.5 py-2.5 rounded-xl"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Plus size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-1.5">Add Vehicle</Text>
          </TouchableOpacity>
        </View>

        <View
          className="flex-row items-center rounded-2xl px-4 py-3 mb-3 border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <Search size={16} color={COLORS.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, number, plate or status..."
            placeholderTextColor={COLORS.textSecondary}
            className="flex-1 text-sm font-semibold ml-2.5"
            style={{ color: COLORS.textPrimary }}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-5"
          contentContainerStyle={{ gap: 8 }}
        >
          <View className="flex-row items-center mr-1">
            <SlidersHorizontal size={13} color={COLORS.textSecondary} />
          </View>
          {FILTERS.map(f => {
            const active = statusFilter === f.key;
            const count = f.key === 'all' ? vehicles.length : vehicles.filter(v => v.status === f.key).length;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setStatusFilter(f.key)}
                className="flex-row items-center px-3.5 py-2 rounded-xl border"
                style={{ backgroundColor: active ? COLORS.primary : COLORS.card, borderColor: active ? COLORS.primary : COLORS.border }}
              >
                <Text style={{ color: active ? '#FFF' : COLORS.textPrimary }} className="text-xs font-bold">
                  {f.label}
                </Text>
                <Text style={{ color: active ? '#FFFFFFCC' : COLORS.textSecondary }} className="text-[10px] font-semibold ml-1.5">
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <EmptyState icon={Bike} title="No vehicles found" subtitle="Try a different search term or filter." />
        ) : (
          <View className="gap-3">
            {filtered.map(v => {
              const assignedUser = users.find(u => u.id === v.assignedUserId);
              const BattIcon = batteryIcon(v.batteryPercent);
              return (
                <View
                  key={v.id}
                  className="rounded-2xl p-4 border"
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                >
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-row items-center flex-1 mr-3">
                      <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                        <Bike size={18} color={COLORS.primary} />
                      </View>
                      <View className="flex-1">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{v.name}</Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{v.vehicleNumber} • {v.manufacturer} {v.model}</Text>
                      </View>
                    </View>
                    <View className="flex-row items-center">
                      <Badge label={v.status} tone={STATUS_TONE[v.status]} />
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between pt-3 border-t" style={{ borderColor: COLORS.border }}>
                    <View className="flex-row items-center">
                      <BattIcon size={14} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-1.5">{v.batteryPercent}%</Text>
                    </View>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                      Reg: {v.registrationNumber}
                    </Text>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                      {assignedUser ? assignedUser.name : 'Unassigned'}
                    </Text>
                  </View>

                  {v.status === 'maintenance' && (
                    <View className="flex-row items-center mt-3 px-3 py-2 rounded-xl" style={{ backgroundColor: COLORS.danger + '10' }}>
                      <Wrench size={12} color={COLORS.danger} />
                      <Text style={{ color: COLORS.danger }} className="text-[10px] font-bold ml-1.5">
                        Next service due {v.nextServiceDue}
                      </Text>
                    </View>
                  )}

                  <View className="flex-row items-center mt-3.5 pt-3 border-t" style={{ borderColor: COLORS.border, gap: 8 }}>
                    {v.status === 'available' && (
                      <TouchableOpacity
                        onPress={() => setAssignTarget(v)}
                        className="flex-row items-center px-3 py-2 rounded-xl flex-1 justify-center"
                        style={{ backgroundColor: COLORS.primary + '14' }}
                      >
                        <Link2 size={13} color={COLORS.primary} />
                        <Text style={{ color: COLORS.primary }} className="text-[11px] font-bold ml-1.5">Assign</Text>
                      </TouchableOpacity>
                    )}
                    {v.status === 'assigned' && (
                      <TouchableOpacity
                        onPress={() => handleUnassign(v)}
                        className="flex-row items-center px-3 py-2 rounded-xl flex-1 justify-center"
                        style={{ backgroundColor: COLORS.danger + '10' }}
                      >
                        <Unlink size={13} color={COLORS.danger} />
                        <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1.5">Unassign</Text>
                      </TouchableOpacity>
                    )}
                    {(v.status === 'charging' || v.status === 'maintenance') && (
                      <View className="flex-1 px-3 py-2 rounded-xl items-center" style={{ backgroundColor: COLORS.background }}>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">Not assignable</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => openEditForm(v)}
                      className="w-9 h-9 rounded-xl items-center justify-center border"
                      style={{ borderColor: COLORS.border }}
                    >
                      <Pencil size={14} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(v)}
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{ backgroundColor: COLORS.danger + '10' }}
                    >
                      <Trash2 size={14} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ADD / EDIT VEHICLE MODAL */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={closeForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}
        >
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' }}>
            <View className="flex-row justify-between items-center px-6 pt-6 pb-4">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
                {editingId ? 'Edit Vehicle' : 'Add Vehicle'}
              </Text>
              <TouchableOpacity
                onPress={closeForm}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              <FormField label="Name" value={form.name} onChangeText={t => setForm(f => ({ ...f, name: t }))} placeholder="e.g. Falcon X1" />
              <FormField label="Vehicle Number" value={form.vehicleNumber} onChangeText={t => setForm(f => ({ ...f, vehicleNumber: t }))} placeholder="e.g. FX-1006" />
              <View className="flex-row" style={{ gap: 12 }}>
                <View className="flex-1">
                  <FormField label="Manufacturer" value={form.manufacturer} onChangeText={t => setForm(f => ({ ...f, manufacturer: t }))} placeholder="e.g. Voltrix" />
                </View>
                <View className="flex-1">
                  <FormField label="Model" value={form.model} onChangeText={t => setForm(f => ({ ...f, model: t }))} placeholder="e.g. X1 Pro" />
                </View>
              </View>
              <FormField label="Registration Number" value={form.registrationNumber} onChangeText={t => setForm(f => ({ ...f, registrationNumber: t }))} placeholder="e.g. KA-01-AB-1234" />
              <FormField label="VIN (optional)" value={form.vin} onChangeText={t => setForm(f => ({ ...f, vin: t }))} placeholder="e.g. VX1PRO000123456" />
              <FormField label="Battery %" value={form.batteryPercent} onChangeText={t => setForm(f => ({ ...f, batteryPercent: t }))} placeholder="0-100" keyboardType="numeric" />

              <View className="mb-3.5">
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider mb-1.5">Status</Text>
                {form.status === 'assigned' ? (
                  <View className="rounded-xl px-3.5 py-3 border" style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}>
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold">
                      Currently assigned. Unassign this vehicle from the fleet list to change its status.
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {EDITABLE_STATUSES.map(s => {
                      const sel = form.status === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => setForm(f => ({ ...f, status: s }))}
                          className="px-3.5 py-2 rounded-xl border"
                          style={{ backgroundColor: sel ? COLORS.primary + '14' : COLORS.background, borderColor: sel ? COLORS.primary : COLORS.border }}
                        >
                          <Text style={{ color: sel ? COLORS.primary : COLORS.textPrimary }} className="text-xs font-bold capitalize">{s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View className="flex-row" style={{ gap: 12 }}>
                <View className="flex-1">
                  <FormField label="Last Service" value={form.lastServiceDate} onChangeText={t => setForm(f => ({ ...f, lastServiceDate: t }))} placeholder="YYYY-MM-DD" />
                </View>
                <View className="flex-1">
                  <FormField label="Next Service Due" value={form.nextServiceDue} onChangeText={t => setForm(f => ({ ...f, nextServiceDue: t }))} placeholder="YYYY-MM-DD" />
                </View>
              </View>
            </ScrollView>

            <View className="px-6 pt-2" style={{ paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}>
              <TouchableOpacity
                onPress={handleSubmit}
                className="w-full py-4 rounded-2xl flex-row justify-center items-center"
                style={{ backgroundColor: COLORS.primary }}
              >
                <Check size={16} color="#FFF" />
                <Text className="text-white font-bold text-sm ml-2">
                  {editingId ? 'Save Changes' : 'Add Vehicle'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* QUICK ASSIGN MODAL */}
      <Modal visible={!!assignTarget} transparent animationType="slide" onRequestClose={() => setAssignTarget(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '75%' }}>
            <View className="flex-row justify-between items-center px-6 pt-6 pb-4">
              <View>
                <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">Assign Rider</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
                  {assignTarget?.vehicleNumber} • {assignTarget?.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAssignTarget(null)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 24 }}>
              {unassignedUsers.length === 0 ? (
                <EmptyState icon={UserIcon} title="No unassigned riders" subtitle="Every active rider already has a scooter." />
              ) : (
                <View className="gap-2.5">
                  {unassignedUsers.map(u => (
                    <TouchableOpacity
                      key={u.id}
                      onPress={() => handlePickRider(u.id)}
                      className="flex-row items-center justify-between rounded-2xl border p-3.5"
                      style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
                    >
                      <View className="flex-row items-center flex-1 mr-3">
                        <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                          <UserIcon size={15} color={COLORS.primary} />
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">{u.name}</Text>
                          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{u.email}</Text>
                        </View>
                      </View>
                      <Check size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}