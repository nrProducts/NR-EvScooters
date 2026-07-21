import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator,
  Modal, Image, RefreshControl, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Search, ShieldCheck, FileText, X, Check, Ban, Eye, AlertTriangle,
  ChevronLeft, Clock, History, SlidersHorizontal,
} from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonList } from '../components/ui/Skeleton';
import { useDebounced } from '../hooks/useDebounced';
import { useKycDetail, useKycQueue } from '../hooks/useKyc';
import { useIsStaff } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import {
  DOC_TYPE_LABEL, KYC_STATUS_LABEL, KYC_STATUS_TONE, VERIFICATION_TONE, formatDate, initialsOf,
} from '../constants/status';
import type { ApiDocument, ApiKycDetail, ApiKycQueueItem, KycStatus, Pagination } from '../types/api';

const QUEUE_FILTERS: { key: KycStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'partially_verified', label: 'Partly' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'verified', label: 'Verified' },
];

export default function KycReviewScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const isStaff = useIsStaff();

  // Deep-linked from the users screen with ?userId=...; otherwise show the queue.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(params.userId ?? null);

  useEffect(() => {
    if (params.userId) setSelectedUserId(params.userId);
  }, [params.userId]);

  if (!isStaff) {
    return (
      <AppShell title="KYC Review">
        <EmptyState
          icon={ShieldCheck}
          title="Staff access only"
          subtitle="You need a staff or admin role to review KYC submissions."
        />
      </AppShell>
    );
  }

  return selectedUserId ? (
    <KycDetailView userId={selectedUserId} onBack={() => setSelectedUserId(null)} />
  ) : (
    <KycQueueView onOpen={setSelectedUserId} />
  );
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const KycQueueView: React.FC<{ onOpen: (userId: string) => void }> = ({ onOpen }) => {
  const [searchInput, setSearchInput] = useState('');
  const debounced = useDebounced(searchInput, 400);
  const [status, setStatus] = useState<KycStatus | 'all'>('all');

  const {
    items, pagination, loading, refreshing, loadingMore, error, refresh, retry, loadMore,
  } = useKycQueue(debounced, status);

  const header = (
    <View>
      <View className="mb-4">
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">
          KYC Review Queue
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
          {pagination ? `${items.length} of ${pagination.total} submissions` : 'Loading queue...'}
        </Text>
      </View>

      <View
        className="flex-row items-center rounded-2xl px-4 py-3 mb-3 border"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
      >
        <Search size={16} color={COLORS.textSecondary} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search rider name, email or phone..."
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="none"
          accessibilityLabel="Search KYC queue"
          className="flex-1 text-sm font-semibold ml-2.5"
          style={{ color: COLORS.textPrimary }}
        />
        {searchInput !== debounced ? <ActivityIndicator size="small" color={COLORS.textSecondary} /> : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-4"
        contentContainerStyle={{ gap: 8 }}
      >
        <View className="flex-row items-center mr-1">
          <SlidersHorizontal size={13} color={COLORS.textSecondary} />
        </View>
        {QUEUE_FILTERS.map((f) => {
          const active = status === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setStatus(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className="px-3.5 py-2 rounded-xl border"
              style={{
                backgroundColor: active ? COLORS.primary : COLORS.card,
                borderColor: active ? COLORS.primary : COLORS.border,
              }}
            >
              <Text style={{ color: active ? '#FFF' : COLORS.textPrimary }} className="text-xs font-bold">
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <AppShell title="KYC Review">
      <View className="flex-1 px-5 pt-5">
        {loading ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {header}
            <SkeletonList count={4} />
          </ScrollView>
        ) : error ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {header}
            <ErrorState message={error.message} offline={error.isOffline} onRetry={() => void retry()} />
          </ScrollView>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.user_id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <EmptyState
                icon={ShieldCheck}
                title="Nothing to review"
                subtitle="No submissions match this filter."
              />
            }
            ListFooterComponent={
              loadingMore ? (
                <View className="py-6">
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onOpen(item.user_id)}
                accessibilityRole="button"
                className="rounded-2xl p-4 border"
                style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-row items-center flex-1 mr-3">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: COLORS.primary + '14' }}
                    >
                      <Text style={{ color: COLORS.primary }} className="text-xs font-black">
                        {initialsOf(item.full_name)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold" numberOfLines={1}>
                        {item.full_name}
                      </Text>
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5" numberOfLines={1}>
                        {item.email ?? item.phone ?? '—'}
                      </Text>
                    </View>
                  </View>
                  <Badge label={KYC_STATUS_LABEL[item.kyc_status]} tone={KYC_STATUS_TONE[item.kyc_status]} />
                </View>

                <View className="flex-row items-center justify-between pt-3 border-t" style={{ borderColor: COLORS.border }}>
                  <View className="flex-row items-center">
                    <FileText size={12} color={COLORS.textSecondary} />
                    <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold ml-1.5">
                      {item.document_count} docs
                    </Text>
                  </View>
                  <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold">
                    {item.completion_percent}% verified
                  </Text>
                  <View className="flex-row items-center">
                    <Clock size={12} color={COLORS.textSecondary} />
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium ml-1.5">
                      {formatDate(item.earliest_submitted_at)}
                    </Text>
                  </View>
                </View>

                {item.has_expired_document ? (
                  <View
                    className="flex-row items-center mt-3 px-3 py-2 rounded-xl"
                    style={{ backgroundColor: COLORS.danger + '10' }}
                  >
                    <AlertTriangle size={12} color={COLORS.danger} />
                    <Text style={{ color: COLORS.danger }} className="text-[10px] font-bold ml-1.5">
                      Contains an expired document
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </AppShell>
  );
};

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

const KycDetailView: React.FC<{ userId: string; onBack: () => void }> = ({ userId, onBack }) => {
  const router = useRouter();
  const { detail, loading, error, busyDocId, approving, rejecting, retry, actions } =
    useKycDetail(userId);

  const [preview, setPreview] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rejectTarget, setRejectTarget] =
    useState<{ kind: 'doc'; doc: ApiDocument } | { kind: 'user' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  /** Signed URL only, held in memory, never written to disk (§10). */
  const openPreview = async (doc: ApiDocument, side: 'front' | 'back') => {
    setPreviewLoading(true);
    const result = await actions.previewUrl(doc.id, side);
    setPreviewLoading(false);

    if (result instanceof ApiError) {
      Alert.alert('Preview unavailable', result.message);
      return;
    }
    setPreview({ url: result.url, isPdf: result.url.toLowerCase().includes('.pdf') });
  };

  const verify = (doc: ApiDocument) => {
    Alert.alert(
      'Verify document',
      `Confirm the ${DOC_TYPE_LABEL[doc.doc_type]} is genuine and matches the rider's details. This is recorded against your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          onPress: async () => {
            const result = await actions.verify(doc.id);
            if (result instanceof ApiError) Alert.alert('Could not verify', result.message);
          },
        },
      ],
    );
  };

  const submitRejection = async () => {
    if (rejectReason.trim().length < 10) {
      Alert.alert('Reason too short', 'Give the rider a clear reason of at least 10 characters.');
      return;
    }
    const result =
      rejectTarget?.kind === 'doc'
        ? await actions.rejectDocument(rejectTarget.doc.id, rejectReason.trim())
        : await actions.rejectAll(rejectReason.trim());

    if (result instanceof ApiError) {
      Alert.alert('Could not reject', result.message);
      return;
    }
    setRejectTarget(null);
    setRejectReason('');
  };

  const approve = () => {
    Alert.alert(
      'Approve KYC',
      `Approve ${detail?.rider.full_name}? They will be able to unlock a scooter.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            const result = await actions.approve();
            if (result instanceof ApiError) {
              Alert.alert('Could not approve', result.message);
              return;
            }
            Alert.alert('Approved', 'The rider is now verified.');
          },
        },
      ],
    );
  };

  const back = () => {
    // When deep-linked from the users list there is no queue behind us.
    if (router.canGoBack()) router.back();
    else onBack();
  };

  if (loading) {
    return (
      <AppShell title="KYC Review">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </AppShell>
    );
  }

  if (error || !detail) {
    return (
      <AppShell title="KYC Review">
        <ErrorState
          message={error?.message ?? 'Could not load this submission.'}
          offline={error?.isOffline}
          onRetry={() => void retry()}
        />
      </AppShell>
    );
  }

  const allVerified = detail.documents.length > 0 && detail.completion_percent === 100;

  return (
    <AppShell title="KYC Review">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity
          onPress={back}
          accessibilityRole="button"
          className="flex-row items-center self-start mb-4"
        >
          <ChevronLeft size={16} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold ml-0.5">
            Back to queue
          </Text>
        </TouchableOpacity>

        {/* Rider summary */}
        <View className="rounded-2xl p-4 border mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <View className="flex-row justify-between items-start mb-3">
            <View className="flex-row items-center flex-1 mr-3">
              <View
                className="w-11 h-11 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: COLORS.primary + '14' }}
              >
                <Text style={{ color: COLORS.primary }} className="text-sm font-black">
                  {initialsOf(detail.rider.full_name)}
                </Text>
              </View>
              <View className="flex-1">
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                  {detail.rider.full_name}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                  {detail.rider.email ?? '—'}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                  {detail.rider.phone ?? '—'}
                </Text>
              </View>
            </View>
            <Badge label={KYC_STATUS_LABEL[detail.kyc_status]} tone={KYC_STATUS_TONE[detail.kyc_status]} />
          </View>

          <View className="pt-3 border-t" style={{ borderColor: COLORS.border }}>
            <DetailRow label="Date of Birth" value={detail.rider.date_of_birth ?? '—'} />
            <DetailRow
              label="Address"
              value={
                [detail.rider.address_line_1, detail.rider.city, detail.rider.state, detail.rider.postal_code]
                  .filter(Boolean)
                  .join(', ') || '—'
              }
            />
            <DetailRow label="Completion" value={`${detail.completion_percent}%`} />
          </View>
        </View>

        {/* Documents */}
        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-black uppercase tracking-wider mb-3">
          Documents
        </Text>

        <View style={{ gap: 12 }}>
          {detail.documents.length === 0 ? (
            <EmptyState icon={FileText} title="No documents" subtitle="This rider hasn't uploaded anything yet." />
          ) : (
            detail.documents.map((doc) => (
              <View
                key={doc.id}
                className="rounded-2xl p-4 border"
                style={{
                  backgroundColor: COLORS.card,
                  borderColor: COLORS.border,
                  opacity: busyDocId === doc.id ? 0.55 : 1,
                }}
              >
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1 mr-3">
                    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                      {DOC_TYPE_LABEL[doc.doc_type]}
                    </Text>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      {doc.doc_number ?? '—'}
                    </Text>
                  </View>
                  <Badge label={doc.verification_status} tone={VERIFICATION_TONE[doc.verification_status]} />
                </View>

                <View className="flex-row" style={{ gap: 10 }}>
                  <ThumbButton label="Front" onPress={() => void openPreview(doc, 'front')} />
                  {doc.has_back_side ? <ThumbButton label="Back" onPress={() => void openPreview(doc, 'back')} /> : null}
                </View>

                <View className="pt-3 mt-3 border-t" style={{ borderColor: COLORS.border }}>
                  <DetailRow label="Expiry" value={doc.expiry_date ? formatDate(doc.expiry_date) : '—'} />
                  <DetailRow label="Submitted" value={formatDate(doc.submitted_at)} />
                  {doc.verified_at ? <DetailRow label="Reviewed" value={formatDate(doc.verified_at)} /> : null}
                </View>

                {doc.is_expired ? (
                  <View className="flex-row items-center mt-3 px-3 py-2 rounded-xl" style={{ backgroundColor: COLORS.danger + '10' }}>
                    <AlertTriangle size={12} color={COLORS.danger} />
                    <Text style={{ color: COLORS.danger }} className="text-[10px] font-bold ml-1.5 flex-1">
                      Expired — cannot be verified.
                    </Text>
                  </View>
                ) : null}

                {doc.rejection_reason ? (
                  <View className="mt-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: COLORS.danger + '10' }}>
                    <Text style={{ color: COLORS.danger }} className="text-[10px] font-black uppercase tracking-wider mb-1">
                      Rejection reason
                    </Text>
                    <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold leading-relaxed">
                      {doc.rejection_reason}
                    </Text>
                  </View>
                ) : null}

                {doc.verification_status === 'pending' ? (
                  <View className="flex-row mt-3.5" style={{ gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => verify(doc)}
                      disabled={busyDocId === doc.id || doc.is_expired}
                      accessibilityRole="button"
                      className="flex-1 flex-row items-center justify-center px-3 py-2.5 rounded-xl"
                      style={{ backgroundColor: doc.is_expired ? COLORS.gray[200] : COLORS.success + '14' }}
                    >
                      <Check size={13} color={doc.is_expired ? COLORS.textSecondary : COLORS.success} />
                      <Text
                        style={{ color: doc.is_expired ? COLORS.textSecondary : COLORS.success }}
                        className="text-[11px] font-bold ml-1.5"
                      >
                        Verify
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setRejectTarget({ kind: 'doc', doc })}
                      disabled={busyDocId === doc.id}
                      accessibilityRole="button"
                      className="flex-1 flex-row items-center justify-center px-3 py-2.5 rounded-xl"
                      style={{ backgroundColor: COLORS.danger + '10' }}
                    >
                      <Ban size={13} color={COLORS.danger} />
                      <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1.5">
                        Reject
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* Final actions */}
        {detail.kyc_status !== 'verified' ? (
          <View className="flex-row mt-5" style={{ gap: 10 }}>
            <TouchableOpacity
              onPress={() => setRejectTarget({ kind: 'user' })}
              accessibilityRole="button"
              className="flex-1 py-3.5 rounded-2xl flex-row justify-center items-center"
              style={{ backgroundColor: COLORS.danger + '10' }}
            >
              <Ban size={15} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="font-bold text-xs ml-2">
                Reject KYC
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={approve}
              disabled={!allVerified || approving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !allVerified || approving }}
              className="flex-1 py-3.5 rounded-2xl flex-row justify-center items-center"
              style={{ backgroundColor: !allVerified || approving ? COLORS.gray[300] : COLORS.primary }}
            >
              {approving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <ShieldCheck size={15} color="#FFF" />
                  <Text className="text-white font-bold text-xs ml-2">Approve KYC</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {!allVerified && detail.kyc_status !== 'verified' ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium text-center mt-2.5">
            Approval unlocks once every required document is verified.
          </Text>
        ) : null}

        {/* History */}
        {detail.history.length > 0 ? (
          <View className="mt-6">
            <View className="flex-row items-center mb-3">
              <History size={13} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-xs font-black uppercase tracking-wider ml-1.5">
                Review History
              </Text>
            </View>
            <View className="rounded-2xl border p-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
              {detail.history.map((h, i) => (
                <View
                  key={h.id}
                  className={i === detail.history.length - 1 ? '' : 'pb-3 mb-3 border-b'}
                  style={i === detail.history.length - 1 ? undefined : { borderColor: COLORS.border }}
                >
                  <View className="flex-row justify-between items-center">
                    <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold">
                      {h.action.replace('kyc.', '').replace(/_/g, ' ')}
                    </Text>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium">
                      {formatDate(h.created_at)}
                    </Text>
                  </View>
                  {typeof h.after_data?.reason === 'string' ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium mt-1 leading-relaxed">
                      {h.after_data.reason}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {previewLoading ? (
        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(15,23,42,0.35)' }}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : null}

      {/* Secure full-screen preview */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.94)' }} className="items-center justify-center px-5">
          <TouchableOpacity
            onPress={() => setPreview(null)}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            className="absolute top-14 right-5 w-10 h-10 rounded-full items-center justify-center z-10"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <X size={18} color="#FFF" />
          </TouchableOpacity>
          {preview?.isPdf ? (
            <View className="items-center">
              <FileText size={44} color="#FFF" />
              <Text className="text-white font-bold text-sm mt-4">PDF document</Text>
              <Text className="text-white/70 font-medium text-[11px] mt-2 text-center px-8 leading-relaxed">
                Inline PDF rendering isn't wired up yet. The signed link expires shortly and is
                never cached on this device.
              </Text>
            </View>
          ) : preview ? (
            <Image
              source={{ uri: preview.url }}
              style={{ width: '100%', height: '80%', borderRadius: 16 }}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      {/* Mandatory rejection reason */}
      <Modal visible={!!rejectTarget} transparent animationType="slide" onRequestClose={() => setRejectTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}
        >
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
            <View className="flex-row justify-between items-center px-6 pt-6 pb-2">
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
                {rejectTarget?.kind === 'doc' ? 'Reject Document' : 'Reject KYC'}
              </Text>
              <TouchableOpacity
                onPress={() => setRejectTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View className="px-6 pb-2">
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-4 leading-relaxed">
                The rider sees this reason and can correct and resubmit. Be specific — "photo
                is too blurred to read the licence number" beats "invalid".
              </Text>

              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Why is this being rejected?"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                accessibilityLabel="Rejection reason"
                className="rounded-xl px-3.5 py-3 text-sm font-semibold border"
                style={{
                  backgroundColor: COLORS.background,
                  borderColor: COLORS.border,
                  color: COLORS.textPrimary,
                  minHeight: 96,
                  textAlignVertical: 'top',
                }}
              />
              <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-semibold mt-1.5">
                {rejectReason.trim().length}/10 characters minimum
              </Text>
            </View>

            <View className="px-6 pt-3" style={{ paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}>
              <TouchableOpacity
                onPress={() => void submitRejection()}
                disabled={rejecting}
                accessibilityRole="button"
                className="w-full py-4 rounded-2xl flex-row justify-center items-center"
                style={{ backgroundColor: rejecting ? COLORS.gray[300] : COLORS.danger }}
              >
                {rejecting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ban size={16} color="#FFF" />
                    <Text className="text-white font-bold text-sm ml-2">Confirm Rejection</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppShell>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-row justify-between items-start py-1.5">
    <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider">
      {label}
    </Text>
    <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold flex-1 text-right ml-4">
      {value}
    </Text>
  </View>
);

const ThumbButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`Preview ${label}`}
    className="flex-1 rounded-xl border items-center justify-center py-4"
    style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
  >
    <Eye size={16} color={COLORS.primary} />
    <Text style={{ color: COLORS.textPrimary }} className="text-[10px] font-bold mt-1.5">
      View {label}
    </Text>
  </TouchableOpacity>
);
