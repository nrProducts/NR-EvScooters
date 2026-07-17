import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { FormField } from '../components/ui/FormField';
import { ChipSelect } from '../components/ui/ChipSelect';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import {
  Plus, Check, CreditCard, Pencil, Trash2, X, Power, PowerOff,
} from 'lucide-react-native';
import type { Plan, PlanTier } from '../types/fleet';

const TIER_OPTIONS: { key: PlanTier; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const DEFAULT_DURATION: Record<PlanTier, string> = {
  daily: '1 day',
  weekly: '7 days',
  monthly: '30 days',
};

interface PlanForm {
  name: string;
  tier: PlanTier;
  price: string;
  duration: string;
  maxDistanceKm: string;
  benefits: string;
  active: boolean;
}

const EMPTY_FORM: PlanForm = {
  name: '', tier: 'monthly', price: '', duration: DEFAULT_DURATION.monthly,
  maxDistanceKm: '', benefits: '', active: true,
};

export default function PlansScreen() {
  const plans = useFleetStore((s) => s.plans);
  const addPlan = useFleetStore((s) => s.addPlan);
  const updatePlan = useFleetStore((s) => s.updatePlan);
  const deletePlan = useFleetStore((s) => s.deletePlan);
  const togglePlanActive = useFleetStore((s) => s.togglePlanActive);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialForm = useMemo(() => form, [formOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      tier: plan.tier,
      price: String(plan.price),
      duration: plan.duration,
      maxDistanceKm: plan.maxDistanceKm ? String(plan.maxDistanceKm) : '',
      benefits: (plan.benefits ?? []).join('\n'),
      active: plan.active,
    });
    setErrors({});
    setFormOpen(true);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const price = Number(form.price);
    const distance = form.maxDistanceKm.trim() ? Number(form.maxDistanceKm) : null;

    if (form.name.trim().length < 2) next.name = 'Give the plan a name.';
    if (form.price.trim() === '' || Number.isNaN(price) || price < 0) {
      next.price = 'Enter a price of 0 or more.';
    }
    if (!form.duration.trim()) next.duration = 'Describe the duration, e.g. 30 days.';
    if (distance !== null && (Number.isNaN(distance) || distance <= 0)) {
      next.maxDistanceKm = 'Enter a positive distance, or leave blank for unlimited.';
    }
    // A duplicate plan name makes the billing picker ambiguous.
    const clash = plans.some(
      (p) => p.id !== editingId && p.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
    );
    if (clash) next.name = 'Another plan already uses this name.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const benefits = form.benefits
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      tier: form.tier,
      price: Number(form.price),
      duration: form.duration.trim(),
      maxDistanceKm: form.maxDistanceKm.trim() ? Number(form.maxDistanceKm) : undefined,
      benefits: benefits.length > 0 ? benefits : undefined,
      active: form.active,
    };

    if (editingId) updatePlan(editingId, payload);
    else addPlan(payload);

    setFormOpen(false);
    setEditingId(null);
  };

  const requestClose = () => {
    if (JSON.stringify(form) === JSON.stringify(initialForm)) {
      setFormOpen(false);
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this plan will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setFormOpen(false) },
    ]);
  };

  const handleDelete = (plan: Plan) => {
    Alert.alert(
      'Delete plan',
      `Delete "${plan.name}"? Riders already on this plan keep their subscription, but it can't be chosen again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deletePlan(plan.id) },
      ],
    );
  };

  const handleToggle = (plan: Plan) => {
    const verb = plan.active ? 'Deactivate' : 'Activate';
    Alert.alert(`${verb} plan`, `${verb} "${plan.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: verb, onPress: () => togglePlanActive(plan.id) },
    ]);
  };

  return (
    <AppShell title="Plans">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center justify-between mb-5">
          <View>
            <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">
              Subscription Plans
            </Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
              {plans.length} plan {plans.length === 1 ? 'tier' : 'tiers'} configured
            </Text>
          </View>
          <TouchableOpacity
            onPress={openAdd}
            accessibilityRole="button"
            accessibilityLabel="Add plan"
            className="flex-row items-center px-3.5 py-2.5 rounded-xl"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Plus size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-1.5">Add Plan</Text>
          </TouchableOpacity>
        </View>

        {plans.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No plans yet"
            subtitle="Add a subscription tier for riders to choose from."
          />
        ) : (
          <View className="gap-3">
            {plans.map((plan) => (
              <View
                key={plan.id}
                className="rounded-2xl p-4 border"
                style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-row items-center flex-1 mr-3">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: COLORS.primary + '14' }}
                    >
                      <CreditCard size={18} color={COLORS.primary} />
                    </View>
                    <View className="flex-1">
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                        {plan.name}
                      </Text>
                      <Text
                        style={{ color: COLORS.textSecondary }}
                        className="text-[11px] font-medium mt-0.5 capitalize"
                      >
                        {plan.tier} plan • {plan.duration}
                      </Text>
                    </View>
                  </View>
                  <Badge
                    label={plan.active ? 'active' : 'inactive'}
                    tone={plan.active ? 'success' : 'neutral'}
                  />
                </View>

                <View
                  className="flex-row items-center justify-between pt-3 border-t"
                  style={{ borderColor: COLORS.border }}
                >
                  <Text style={{ color: COLORS.primary }} className="text-lg font-black">
                    ${plan.price.toFixed(2)}
                  </Text>
                  {plan.maxDistanceKm ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                      Up to {plan.maxDistanceKm} km/day
                    </Text>
                  ) : (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                      Unlimited distance
                    </Text>
                  )}
                </View>

                {plan.benefits && plan.benefits.length > 0 && (
                  <View className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.border }}>
                    {plan.benefits.map((b) => (
                      <View key={b} className="flex-row items-center mb-1.5">
                        <Check size={12} color={COLORS.success} />
                        <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-medium ml-2">
                          {b}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View
                  className="flex-row items-center mt-3.5 pt-3 border-t"
                  style={{ borderColor: COLORS.border, gap: 8 }}
                >
                  <TouchableOpacity
                    onPress={() => handleToggle(plan)}
                    accessibilityRole="button"
                    className="flex-row items-center px-3 py-2 rounded-xl flex-1 justify-center"
                    style={{
                      backgroundColor: plan.active ? COLORS.warning + '14' : COLORS.success + '14',
                    }}
                  >
                    {plan.active ? (
                      <PowerOff size={13} color={COLORS.warning} />
                    ) : (
                      <Power size={13} color={COLORS.success} />
                    )}
                    <Text
                      style={{ color: plan.active ? COLORS.warning : COLORS.success }}
                      className="text-[11px] font-bold ml-1.5"
                    >
                      {plan.active ? 'Deactivate' : 'Activate'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openEdit(plan)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${plan.name}`}
                    className="w-9 h-9 rounded-xl items-center justify-center border"
                    style={{ borderColor: COLORS.border }}
                  >
                    <Pencil size={14} color={COLORS.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDelete(plan)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${plan.name}`}
                    className="w-9 h-9 rounded-xl items-center justify-center"
                    style={{ backgroundColor: COLORS.danger + '10' }}
                  >
                    <Trash2 size={14} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ADD / EDIT PLAN MODAL */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={requestClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}
        >
          <View
            style={{
              backgroundColor: COLORS.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '88%',
            }}
          >
            <View className="flex-row justify-between items-center px-6 pt-6 pb-4">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
                {editingId ? 'Edit Plan' : 'Add Plan'}
              </Text>
              <TouchableOpacity
                onPress={requestClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              <FormField
                label="Plan Name"
                required
                value={form.name}
                onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                placeholder="e.g. Commuter Monthly"
                error={errors.name}
              />

              <ChipSelect
                label="Tier"
                required
                options={TIER_OPTIONS}
                value={form.tier}
                onChange={(tier) =>
                  setForm((f) => ({
                    ...f,
                    tier,
                    // Keep duration in step unless it was hand-edited.
                    duration:
                      f.duration === DEFAULT_DURATION[f.tier] ? DEFAULT_DURATION[tier] : f.duration,
                  }))
                }
              />

              <View className="flex-row" style={{ gap: 12 }}>
                <View className="flex-1">
                  <FormField
                    label="Price"
                    required
                    value={form.price}
                    onChangeText={(t) => setForm((f) => ({ ...f, price: t }))}
                    placeholder="49.00"
                    keyboardType="numeric"
                    error={errors.price}
                  />
                </View>
                <View className="flex-1">
                  <FormField
                    label="Duration"
                    required
                    value={form.duration}
                    onChangeText={(t) => setForm((f) => ({ ...f, duration: t }))}
                    placeholder="30 days"
                    error={errors.duration}
                  />
                </View>
              </View>

              <FormField
                label="Max Distance (km/day)"
                value={form.maxDistanceKm}
                onChangeText={(t) => setForm((f) => ({ ...f, maxDistanceKm: t }))}
                placeholder="Leave blank for unlimited"
                keyboardType="numeric"
                error={errors.maxDistanceKm}
              />

              <FormField
                label="Benefits"
                value={form.benefits}
                onChangeText={(t) => setForm((f) => ({ ...f, benefits: t }))}
                placeholder={'One per line, e.g.\nFree roadside assistance\nPriority swaps'}
                multiline
                hint="One benefit per line."
              />

              <ChipSelect
                label="Status"
                options={[
                  { key: 'active', label: 'Active' },
                  { key: 'inactive', label: 'Inactive' },
                ]}
                value={form.active ? 'active' : 'inactive'}
                onChange={(v) => setForm((f) => ({ ...f, active: v === 'active' }))}
              />
            </ScrollView>

            <View className="px-6 pt-2" style={{ paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}>
              <TouchableOpacity
                onPress={handleSubmit}
                accessibilityRole="button"
                className="w-full py-4 rounded-2xl flex-row justify-center items-center"
                style={{ backgroundColor: COLORS.primary }}
              >
                <Check size={16} color="#FFF" />
                <Text className="text-white font-bold text-sm ml-2">
                  {editingId ? 'Save Changes' : 'Add Plan'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppShell>
  );
}
