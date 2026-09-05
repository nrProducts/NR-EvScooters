import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft, MapPin, Bike, Navigation, Check, AlertTriangle, CheckCircle2,
  ShieldCheck, Zap, Lock, BadgePercent, Calendar, ArrowRight,
  CreditCard, Landmark, Wallet, Smartphone,
} from 'lucide-react-native';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/ErrorState';
import { useBookingStore } from '../../store/useBookingStore';
import { useAuthStore } from '../../store/useAuthStore';
import { vehicleCatalogRepository, billingRepository } from '../../services';
import { notify, notifyError } from '../../lib/confirm';
import { buildMapsUrl, buildWebMapsUrl } from '../../lib/maps';
import { getNextBookableDay } from '../../lib/bookingDays';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../../lib/razorpayCheckout';
import { DEFAULT_CANCELLATION_TIERS } from '../../lib/cancellationPolicy';
import { ApiError } from '../../lib/ApiError';
import { COLORS } from '../../constants/theme';
import type { ApiAvailability, ApiOrderLine, ApiPaymentOrder, ApiPlan, ApiPlanQuote, ApiVehicleModelDetail } from '../../types/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT, type CopyKey } from '../../i18n';
import { BILLING_CYCLE_LABEL_KEY } from '../../constants/status';

// Device geolocation isn't wired up yet — the backend's nearest_station RPC
// still does the real PostGIS work against whatever coordinates are sent.
const PLACEHOLDER_LOCATION = { lat: 9.9312, lng: 76.2673 };

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const TrustRow: React.FC = () => {
  const { t } = useT();
  const items: { Icon: typeof ShieldCheck; labelKey: CopyKey }[] = [
    { Icon: ShieldCheck, labelKey: 'booking.trust.securePayment' },
    { Icon: Zap, labelKey: 'booking.trust.instantRefunds' },
    { Icon: Lock, labelKey: 'booking.trust.razorpay' },
  ];
  return (
    <View className="flex-row justify-around py-1">
      {items.map(({ Icon, labelKey }) => (
        <View key={labelKey} className="flex-row items-center" style={{ gap: 6 }}>
          <Icon size={14} color={COLORS.primary} />
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">{t(labelKey)}</Text>
        </View>
      ))}
    </View>
  );
};

/**
 * Informational — the actual selection happens on Razorpay's secure screen.
 * Keys, not labels: module scope does not re-run on a language change.
 */
const PAYMENT_METHOD_KEYS = [
  { Icon: Smartphone, titleKey: 'booking.paymentMethods.upi', subtitleKey: 'booking.paymentMethods.upiSubtitle' },
  { Icon: CreditCard, titleKey: 'booking.paymentMethods.cards', subtitleKey: 'booking.paymentMethods.cardsSubtitle' },
  { Icon: Landmark, titleKey: 'booking.paymentMethods.netBanking', subtitleKey: 'booking.paymentMethods.netBankingSubtitle' },
  { Icon: Wallet, titleKey: 'booking.paymentMethods.wallets', subtitleKey: 'booking.paymentMethods.walletsSubtitle' },
] as const satisfies readonly { Icon: typeof Smartphone; titleKey: CopyKey; subtitleKey: CopyKey }[];

const PaymentMethodsCard: React.FC = () => {
  const { t } = useT();
  return (
    <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
      <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider px-4 pt-4 pb-1">
        {t('booking.paymentMethods.title')}
      </Text>
      {PAYMENT_METHOD_KEYS.map(({ Icon, titleKey, subtitleKey }, i) => (
        <View
          key={titleKey}
          className="flex-row items-center px-4 py-3"
          style={i > 0 ? { borderTopWidth: 1, borderColor: COLORS.border } : undefined}
        >
          <View className="w-9 h-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
            <Icon size={17} color={COLORS.primary} />
          </View>
          <View className="flex-1">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">{t(titleKey)}</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{t(subtitleKey)}</Text>
          </View>
        </View>
      ))}
      <View className="px-4 py-2.5 flex-row items-center" style={{ backgroundColor: COLORS.background, gap: 6 }}>
        <Lock size={12} color={COLORS.textSecondary} />
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
          {t('booking.paymentMethods.chooseOnRazorpay')}
        </Text>
      </View>
    </View>
  );
};

/**
 * The whole booking flow on ONE screen: pickup station, plan, price, and a
 * single "Pay ₹X" button that opens Razorpay Checkout directly (card / UPI /
 * wallet selection happens in that sheet). No separate review screen.
 */
export default function BookingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { modelId } = useLocalSearchParams<{ modelId: string }>();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const {
    draft, loadingStation, stationError, setVehicleModel, setStartDay, setPlan,
    loadNearestStation, reset,
  } = useBookingStore();

  const [model, setModel] = useState<ApiVehicleModelDetail | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<ApiAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const [quote, setQuote] = useState<ApiPaymentOrder | ApiPlanQuote | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = () => {
    setLoadingModel(true);
    setModelError(null);
    vehicleCatalogRepository
      .get(modelId)
      .then((data) => {
        setModel(data);
        setVehicleModel(data);
      })
      .catch((err) => setModelError(err instanceof ApiError ? err.message : t('booking.error.loadModel')))
      .finally(() => setLoadingModel(false));
  };

  useEffect(() => {
    load();
    void loadNearestStation(PLACEHOLDER_LOCATION.lat, PLACEHOLDER_LOCATION.lng);
    setStartDay(getNextBookableDay());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const stationId = draft.station?.id;
  useEffect(() => {
    if (!stationId) return;
    setLoadingAvailability(true);
    vehicleCatalogRepository
      .availability(modelId, stationId)
      .then(setAvailability)
      .catch(() => setAvailability(null))
      .finally(() => setLoadingAvailability(false));
  }, [modelId, stationId]);

  // Authoritative price for the chosen plan, before any booking exists.
  useEffect(() => {
    const planId = draft.plan?.id;
    if (!planId) { setQuote(null); return; }
    let cancelled = false;
    billingRepository
      .quotePlan(planId, draft.startDay ?? undefined)
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [draft.plan?.id, draft.startDay]);

  const plans = model?.plans ?? [];
  const availableCount = availability?.available_count ?? null;
  const noneAvailable = availableCount === 0;
  const lines: ApiOrderLine[] = quote?.lines ?? [];
  const saved = useMemo(
    () => lines.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0),
    [lines],
  );
  const total = quote
    ? quote.amount
    : (draft.plan ? draft.plan.price + draft.plan.deposit_amount : 0);

  const blockedReason = (): string | null => {
    if (!draft.station) return t('booking.blocked.findingStation');
    if (noneAvailable) return t('booking.blocked.noneAvailable');
    if (plans.length === 0) return t('booking.blocked.noPlans');
    if (!draft.plan) return t('booking.blocked.choosePlan');
    return null;
  };

  const handlePickupDestination = async () => {
    if (!draft.station) return;
    const { lat, lng } = draft.station;
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    const url = buildMapsUrl(lat, lng, platform);
    try {
      const canOpen = await Linking.canOpenURL(url);
      await Linking.openURL(canOpen ? url : buildWebMapsUrl(lat, lng));
    } catch {
      notifyError(t('booking.error.maps.title'), t('booking.error.maps.message'));
    }
  };

  const handlePay = async () => {
    if (blockedReason()) {
      notify(t('booking.almostThere'), blockedReason() as string);
      return;
    }
    if (!draft.plan || !draft.station || !draft.startDay || !model) return;
    setPayError(null);
    setPaying(true);
    try {
      // Pay-first: this creates ONLY a payment intent — no booking exists until
      // the payment captures and the backend materialises it.
      const order = await billingRepository.createBookingOrder({
        plan_id: draft.plan.id,
        vehicle_model_id: model.id,
        station_id: draft.station.id,
        start_day: draft.startDay,
      });
      setQuote(order);
      const verifyPayload = await openRazorpayCheckout({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        order_id: order.gatewayOrderId,
        description: draft.plan
          ? t('booking.checkoutDescription', { plan: draft.plan.name })
          : t('booking.checkoutDescriptionFallback'),
        prefill: {
          email: profile?.email ?? undefined,
          contact: profile?.phone ?? undefined,
          name: profile?.full_name,
        },
        theme: { color: COLORS.primary },
      });
      await billingRepository.verifyPayment(verifyPayload);
      await refreshProfile();
      setPaid(true);
    } catch (err) {
      if (err instanceof PaymentCancelledError) {
        // Nothing was created — a retry just makes a fresh (or reused) intent.
        setPayError(t('booking.error.paymentCancelled'));
      } else if (err instanceof PaymentUnavailableError || err instanceof ApiError) {
        setPayError(err.message);
      } else {
        setPayError(t('booking.error.generic'));
      }
    } finally {
      setPaying(false);
    }
  };

  const handleDone = () => {
    reset();
    void refreshProfile();
    router.replace('/home');
  };

  if (paid) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-full items-center justify-center mb-5" style={{ backgroundColor: COLORS.success + '1A' }}>
            <CheckCircle2 size={32} color={COLORS.success} />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">{t('booking.confirmed.title')}</Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium text-center mt-2 leading-relaxed">
            {t('booking.confirmed.body', {
              station: draft.station?.name ?? t('booking.confirmed.yourPickupStation'),
              scooter: model?.name ?? t('booking.confirmed.yourScooter'),
            })}
          </Text>
          <TouchableOpacity onPress={handleDone} className="mt-8 py-4 px-8 rounded-2xl items-center" style={{ backgroundColor: COLORS.primary }}>
            <Text className="text-white text-sm font-bold">{t('booking.confirmed.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const busy = paying;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View
        className="flex-row items-center px-3 border-b"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: COLORS.background }}
        >
          <ChevronLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: COLORS.textPrimary }} className="flex-1 text-center text-base font-black" numberOfLines={1}>
          {draft.plan
            ? t('booking.confirmAndPay')
            : t('booking.bookScooter', { scooter: model?.name ?? t('bookingHistory.scooterFallback') })}
        </Text>
        <View className="w-9" />
      </View>

      {loadingModel ? (
        <View className="flex-1 items-center justify-center"><Spinner size={32} color={COLORS.primary} /></View>
      ) : modelError || !model ? (
        <ErrorState message={modelError ?? t('booking.error.modelNotFound')} onRetry={load} />
      ) : (
        <>
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Pickup station */}
            <View className="rounded-2xl border p-4 mb-3" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
              <View className="flex-row items-center">
                <MapPin size={16} color={COLORS.primary} />
                <View className="flex-1 ml-3">
                  <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">{t('booking.pickupLocation')}</Text>
                  {loadingStation ? (
                    <Spinner size={14} color={COLORS.primary} />
                  ) : stationError ? (
                    <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mt-0.5">{stationError}</Text>
                  ) : draft.station ? (
                    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mt-0.5">{draft.station.name}</Text>
                  ) : null}
                </View>
                {draft.station?.distance_km != null ? (
                  <Badge label={`${draft.station.distance_km.toFixed(1)} km`} tone="neutral" />
                ) : null}
              </View>
              {draft.station ? (
                <TouchableOpacity
                  onPress={handlePickupDestination}
                  className="flex-row items-center justify-center rounded-xl py-2 mt-3"
                  style={{ backgroundColor: COLORS.primary + '12' }}
                >
                  <Navigation size={13} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary }} className="text-xs font-bold ml-1.5">{t('booking.getDirections')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Availability */}
            <View className="rounded-2xl border p-4 mb-3 flex-row items-center justify-between" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
              <View className="flex-row items-center flex-1 mr-3">
                <Bike size={16} color={noneAvailable ? COLORS.danger : COLORS.primary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-2.5">
                  {loadingAvailability || availableCount == null
                    ? t('booking.checkingAvailability')
                    : t('booking.availableHere', { count: availableCount })}
                </Text>
              </View>
              {availableCount != null ? (
                <Badge
                  label={noneAvailable ? t('booking.unavailable') : t('booking.available')}
                  tone={noneAvailable ? 'danger' : 'success'}
                />
              ) : null}
            </View>

            {/* Immediate-pickup note */}
            <View className="rounded-2xl border p-3 flex-row items-start mb-4" style={{ backgroundColor: COLORS.warning + '12', borderColor: COLORS.warning + '33', gap: 8 }}>
              <AlertTriangle size={16} color={COLORS.warning} />
              <View className="flex-1">
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">{t('booking.startsNow.title')}</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5 leading-relaxed">
                  {t('booking.startsNow.body')}
                </Text>
              </View>
            </View>

            {/* Plan picker */}
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-1">{t('booking.choosePlan')}</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-3">
              {plans.length > 0 ? t('booking.choosePlanHint') : t('booking.noPlansHint')}
            </Text>
            <View style={{ gap: 10 }}>
              {plans.map((plan: ApiPlan) => {
                const selected = draft.plan?.id === plan.id;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    onPress={() => setPlan(plan)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className="rounded-2xl p-4 border flex-row items-center justify-between"
                    style={{
                      backgroundColor: selected ? COLORS.primary + '0F' : COLORS.card,
                      borderColor: selected ? COLORS.primary : COLORS.border,
                      borderWidth: selected ? 2 : 1,
                    }}
                  >
                    <View className="flex-1 mr-3">
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                        {t(BILLING_CYCLE_LABEL_KEY[plan.billing_cycle])}
                      </Text>
                      {plan.included_minutes != null ? (
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                          {t('booking.minutesIncluded', { minutes: plan.included_minutes })}
                        </Text>
                      ) : null}
                    </View>
                    <View className="flex-row items-center">
                      <Text style={{ color: COLORS.primary }} className="text-sm font-extrabold mr-2">{money(plan.price)}</Text>
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: selected ? COLORS.primary : 'transparent',
                          borderWidth: selected ? 0 : 1.5,
                          borderColor: COLORS.border,
                        }}
                      >
                        {selected ? <Check size={12} color="#FFF" /> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Payment summary + methods — inline once a plan is chosen. */}
            {draft.plan ? (
              <View className="mt-6" style={{ gap: 12 }}>
                {saved > 0 ? (
                  <View className="flex-row items-center rounded-2xl px-4 py-3" style={{ backgroundColor: COLORS.primary, gap: 10 }}>
                    <BadgePercent size={18} color="#FFF" />
                    <View className="flex-1">
                      <Text className="text-white text-sm font-black">{t('booking.dealApplied')}</Text>
                      <Text className="text-white/85 text-[11px] font-semibold">
                        {t('booking.youSave', { amount: money(saved) })}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Payment Summary */}
                <View className="rounded-2xl border p-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                  <View className="flex-row items-center justify-between mb-3">
                    <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">
                      {t('booking.paymentSummary')}
                    </Text>
                    <View className="flex-row items-center" style={{ gap: 4 }}>
                      <Calendar size={12} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                        {t('booking.startsOn', {
                          date: draft.startDay ? formatDay(draft.startDay) : t('booking.startsToday'),
                        })}
                      </Text>
                    </View>
                  </View>

                  {lines.length > 0 ? (
                    lines.map((line, i) => (
                      <View key={i} className="flex-row items-center justify-between py-1.5">
                        <Text style={{ color: line.amount < 0 ? COLORS.success : COLORS.textSecondary }} className="text-[13px] font-medium flex-1 pr-3">
                          {line.description}
                        </Text>
                        <Text style={{ color: line.amount < 0 ? COLORS.success : COLORS.textPrimary }} className="text-[13px] font-semibold">
                          {line.amount < 0 ? '-' : ''}{money(Math.abs(line.amount))}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <>
                      <View className="flex-row items-center justify-between py-1.5">
                        <Text style={{ color: COLORS.textSecondary }} className="text-[13px] font-medium">{t('booking.rentalPlanAmount')}</Text>
                        <Text style={{ color: COLORS.textPrimary }} className="text-[13px] font-semibold">{money(draft.plan.price)}</Text>
                      </View>
                      <View className="flex-row items-center justify-between py-1.5">
                        <Text style={{ color: COLORS.textSecondary }} className="text-[13px] font-medium">{t('booking.securityDepositRefundable')}</Text>
                        <Text style={{ color: COLORS.textPrimary }} className="text-[13px] font-semibold">{money(draft.plan.deposit_amount)}</Text>
                      </View>
                    </>
                  )}

                  <View className="h-px my-3" style={{ backgroundColor: COLORS.border }} />
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-black">
                        {quote ? t('booking.totalPayable') : t('booking.estimatedTotal')}
                      </Text>
                      {!quote ? (
                        <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium mt-0.5">
                          {t('booking.confirmedOnPaymentScreen')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ color: COLORS.primary }} className="text-2xl font-black">{money(total)}</Text>
                  </View>
                </View>

                <PaymentMethodsCard />

                <TrustRow />

                <View className="flex-row items-start rounded-2xl p-3" style={{ backgroundColor: COLORS.primary + '0D', gap: 8 }}>
                  <ShieldCheck size={14} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium flex-1 leading-relaxed">
                    {t('booking.cancellationNote', {
                      minutes: DEFAULT_CANCELLATION_TIERS[0].upto_minutes,
                      percent: DEFAULT_CANCELLATION_TIERS[0].penalty_percent,
                    })}
                  </Text>
                </View>
              </View>
            ) : null}

            {payError ? (
              <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mt-3 text-center">{payError}</Text>
            ) : null}
          </ScrollView>

          {/* Sticky checkout bar */}
          <View
            className="px-4 pt-3 flex-row items-center"
            style={{
              backgroundColor: COLORS.card,
              borderTopWidth: 1,
              borderColor: COLORS.border,
              paddingBottom: 12 + insets.bottom,
              gap: 14,
              shadowColor: COLORS.black,
              shadowOpacity: 0.08,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: -3 },
              elevation: 12,
            }}
          >
            <View className="shrink-0">
              <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">
                {draft.plan ? t('booking.totalPayable') : t('booking.amount')}
              </Text>
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
                {draft.plan ? money(total) : t('common.dash')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handlePay}
              disabled={busy || blockedReason() !== null}
              accessibilityRole="button"
              className="flex-1 rounded-2xl items-center flex-row justify-center"
              style={{
                backgroundColor: COLORS.primary,
                opacity: busy || blockedReason() !== null ? 0.5 : 1,
                minHeight: 52,
              }}
            >
              {busy ? <Spinner size={16} color="#FFF" /> : null}
              <Text className="text-white text-base font-black ml-2" numberOfLines={1}>
                {busy ? t('booking.processing') : (blockedReason() ?? t('booking.continue'))}
              </Text>
              {!busy && !blockedReason() ? <ArrowRight size={18} color="#FFF" style={{ marginLeft: 6 }} /> : null}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
