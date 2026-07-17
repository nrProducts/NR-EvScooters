import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  Modal, Image, RefreshControl, Platform,
} from 'react-native';
import {
  ShieldCheck, Upload, FileText, Check, X, ChevronRight, ChevronLeft,
  Trash2, Eye, AlertTriangle, Clock, RefreshCw,
} from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { useAuthStore } from '../store/useAuthStore';
import { useMyKyc } from '../hooks/useKyc';
import { ApiError } from '../lib/ApiError';
import { pickDocument } from '../lib/filePicker';
import { COLORS } from '../constants/theme';
import { DOC_TYPE_LABEL, KYC_STATUS_LABEL, KYC_STATUS_TONE, VERIFICATION_TONE, formatDate } from '../constants/status';
import type { ApiDocument, ApiKycSummary, KycDocType, LocalFile } from '../types/api';

type Step = 0 | 1 | 2 | 3;
const STEP_TITLES = ['Personal', 'National ID', 'Licence', 'Review'];

interface DraftDoc {
  doc_number: string;
  expiry_date: string;
  front: LocalFile | null;
  back: LocalFile | null;
}

const EMPTY_DRAFT: DraftDoc = { doc_number: '', expiry_date: '', front: null, back: null };

export default function KycScreen() {
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  // The hook owns loading, refreshing, upload and submit state.
  const { kyc, loading, refreshing, error, uploading, submitting, refresh, retry, actions } = useMyKyc();

  const [step, setStep] = useState<Step>(0);
  const [idDraft, setIdDraft] = useState<DraftDoc>(EMPTY_DRAFT);
  const [dlDraft, setDlDraft] = useState<DraftDoc>(EMPTY_DRAFT);
  const [declared, setDeclared] = useState(false);
  const [consented, setConsented] = useState(false);

  const [preview, setPreview] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const docOf = (type: KycDocType): ApiDocument | undefined =>
    kyc?.documents.find((d) => d.doc_type === type);

  const idDoc = docOf('national_id');
  const dlDoc = docOf('driving_license');

  const locked = kyc?.kyc_status === 'verified';

  /**
   * A rejected document is the one case where the rider must be able to
   * replace something already on the server, so it does not count as "on file"
   * for the purposes of the wizard.
   */
  const isOnFile = (doc?: ApiDocument) => !!doc && doc.verification_status !== 'rejected';

  const upload = async (type: KycDocType, draft: DraftDoc, existing?: ApiDocument) => {
    if (!draft.doc_number.trim()) {
      Alert.alert('Document number required', 'Enter the number printed on the document.');
      return;
    }
    if (!draft.front && !existing) {
      Alert.alert('Front image required', 'Add a photo or PDF of the front of the document.');
      return;
    }
    if (type === 'driving_license' && !draft.expiry_date.trim()) {
      Alert.alert('Expiry date required', 'A driving licence must include its expiry date.');
      return;
    }
    if (draft.expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(draft.expiry_date.trim())) {
      Alert.alert('Invalid date', 'Use the format YYYY-MM-DD.');
      return;
    }

    const correcting = existing?.verification_status === 'rejected' ? existing.id : undefined;
    const result = await actions.upload(
      {
        doc_type: type,
        doc_number: draft.doc_number.trim(),
        expiry_date: draft.expiry_date.trim() || undefined,
        front: draft.front!,
        back: draft.back ?? undefined,
      },
      correcting,
    );

    if (result instanceof ApiError) {
      Alert.alert('Upload failed', result.message);
      return;
    }

    if (type === 'national_id') setIdDraft(EMPTY_DRAFT);
    else setDlDraft(EMPTY_DRAFT);
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  };

  const removeDoc = (doc: ApiDocument) => {
    Alert.alert('Remove document', `Remove your ${DOC_TYPE_LABEL[doc.doc_type]}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const result = await actions.remove(doc.id);
          if (result instanceof ApiError) Alert.alert('Could not remove', result.message);
        },
      },
    ]);
  };

  /**
   * Bytes are fetched through a signed URL minted for this request only, and
   * held in component state — never written to disk or cached (§10).
   */
  const openPreview = async (doc: ApiDocument, side: 'front' | 'back' = 'front') => {
    setPreviewLoading(true);
    const result = await actions.previewUrl(doc.id, side);
    setPreviewLoading(false);

    if (result instanceof ApiError) {
      Alert.alert('Preview unavailable', result.message);
      return;
    }
    setPreview({ url: result.url, isPdf: result.url.toLowerCase().includes('.pdf') });
  };

  const submit = async () => {
    if (!declared || !consented) {
      Alert.alert('Confirmation needed', 'Tick both boxes to submit your KYC.');
      return;
    }
    const result = await actions.submit();
    if (result instanceof ApiError) {
      Alert.alert('Could not submit', result.message);
      return;
    }
    // KYC status gates scooter unlock, so the cached profile must catch up.
    await refreshProfile();
    Alert.alert('Submitted', 'Your documents are with our team. We will notify you once reviewed.');
  };

  if (loading) {
    return (
      <AppShell title="KYC Verification">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textSecondary }} className="font-medium mt-4 text-xs">
            Loading your verification...
          </Text>
        </View>
      </AppShell>
    );
  }

  if (error || !kyc) {
    return (
      <AppShell title="KYC Verification">
        <ErrorState
          message={error?.message ?? 'Could not load your KYC.'}
          offline={error?.isOffline}
          onRetry={() => void retry()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="KYC Verification">
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        <StatusHeader kyc={kyc} />

        {locked ? (
          <View
            className="rounded-2xl p-4 border items-center"
            style={{ backgroundColor: COLORS.success + '0A', borderColor: COLORS.success + '33' }}
          >
            <ShieldCheck size={28} color={COLORS.success} />
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-3">
              You're verified
            </Text>
            <Text
              style={{ color: COLORS.textSecondary }}
              className="text-[11px] font-medium text-center mt-1.5 leading-relaxed"
            >
              Your documents are approved and your scooter can be unlocked. If a document
              expires you'll be asked to upload a current one.
            </Text>
            <View className="w-full mt-4" style={{ gap: 10 }}>
              {kyc.documents.map((d) => (
                <DocSummaryRow key={d.id} doc={d} onPreview={() => void openPreview(d)} />
              ))}
            </View>
          </View>
        ) : (
          <>
            <StepBar step={step} onSelect={setStep} />

            {step === 0 ? (
              <PersonalStep
                fullName={profile?.full_name ?? ''}
                dob={profile?.date_of_birth ?? null}
                phone={profile?.phone ?? null}
                address={[profile?.address_line_1, profile?.city, profile?.state, profile?.postal_code]
                  .filter(Boolean)
                  .join(', ')}
                onNext={() => setStep(1)}
              />
            ) : null}

            {step === 1 ? (
              <DocumentStep
                type="national_id"
                doc={idDoc}
                draft={idDraft}
                setDraft={setIdDraft}
                uploading={uploading === 'national_id'}
                onUpload={() => void upload('national_id', idDraft, idDoc)}
                onRemove={() => idDoc && removeDoc(idDoc)}
                onPreview={(side) => idDoc && void openPreview(idDoc, side)}
                onBack={() => setStep(0)}
                onSkip={isOnFile(idDoc) ? () => setStep(2) : undefined}
                requiresExpiry={false}
              />
            ) : null}

            {step === 2 ? (
              <DocumentStep
                type="driving_license"
                doc={dlDoc}
                draft={dlDraft}
                setDraft={setDlDraft}
                uploading={uploading === 'driving_license'}
                onUpload={() => void upload('driving_license', dlDraft, dlDoc)}
                onRemove={() => dlDoc && removeDoc(dlDoc)}
                onPreview={(side) => dlDoc && void openPreview(dlDoc, side)}
                onBack={() => setStep(1)}
                onSkip={isOnFile(dlDoc) ? () => setStep(3) : undefined}
                requiresExpiry
              />
            ) : null}

            {step === 3 ? (
              <ReviewStep
                kyc={kyc}
                profile={profile}
                declared={declared}
                consented={consented}
                setDeclared={setDeclared}
                setConsented={setConsented}
                submitting={submitting}
                onSubmit={() => void submit()}
                onBack={() => setStep(2)}
                onPreview={(d) => void openPreview(d)}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      {previewLoading ? (
        <View
          className="absolute inset-0 items-center justify-center"
          style={{ backgroundColor: 'rgba(15,23,42,0.35)' }}
        >
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      ) : null}

      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

const StatusHeader: React.FC<{ kyc: ApiKycSummary }> = ({ kyc }) => (
  <View
    className="rounded-2xl p-4 border mb-4"
    style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
  >
    <View className="flex-row items-center justify-between mb-3">
      <View className="flex-row items-center flex-1 mr-3">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: COLORS.primary + '14' }}
        >
          <ShieldCheck size={18} color={COLORS.primary} />
        </View>
        <View className="flex-1">
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
            Identity Verification
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
            {kyc.completion_percent}% complete
          </Text>
        </View>
      </View>
      <Badge label={KYC_STATUS_LABEL[kyc.kyc_status]} tone={KYC_STATUS_TONE[kyc.kyc_status]} />
    </View>

    <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.border }}>
      <View
        className="h-full rounded-full"
        style={{
          width: `${kyc.completion_percent}%`,
          backgroundColor: kyc.kyc_status === 'rejected' ? COLORS.danger : COLORS.primary,
        }}
      />
    </View>

    {kyc.kyc_status === 'rejected' ? (
      <View
        className="flex-row items-center mt-3 px-3 py-2 rounded-xl"
        style={{ backgroundColor: COLORS.danger + '10' }}
      >
        <AlertTriangle size={12} color={COLORS.danger} />
        <Text style={{ color: COLORS.danger }} className="text-[10px] font-bold ml-1.5 flex-1">
          A document was rejected. Fix it below and resubmit.
        </Text>
      </View>
    ) : kyc.kyc_status === 'pending' ? (
      <View
        className="flex-row items-center mt-3 px-3 py-2 rounded-xl"
        style={{ backgroundColor: COLORS.warning + '10' }}
      >
        <Clock size={12} color={COLORS.warning} />
        <Text style={{ color: COLORS.warning }} className="text-[10px] font-bold ml-1.5 flex-1">
          Your documents are being reviewed. Nothing more to do for now.
        </Text>
      </View>
    ) : null}
  </View>
);

const StepBar: React.FC<{ step: Step; onSelect: (s: Step) => void }> = ({ step, onSelect }) => (
  <View className="flex-row mb-5" style={{ gap: 6 }}>
    {STEP_TITLES.map((title, i) => {
      const active = step === i;
      const done = step > i;
      return (
        <TouchableOpacity
          key={title}
          onPress={() => onSelect(i as Step)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          className="flex-1 items-center"
        >
          <View
            className="w-full h-1.5 rounded-full mb-1.5"
            style={{ backgroundColor: active || done ? COLORS.primary : COLORS.border }}
          />
          <Text
            style={{ color: active ? COLORS.primary : COLORS.textSecondary }}
            className="text-[10px] font-bold"
          >
            {title}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const PersonalStep: React.FC<{
  fullName: string; dob: string | null; phone: string | null; address: string; onNext: () => void;
}> = ({ fullName, dob, phone, address, onNext }) => (
  <View className="rounded-2xl p-4 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-1">
      Check your details
    </Text>
    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-4 leading-relaxed">
      These must match your documents exactly. Edit them from Settings if anything is wrong.
    </Text>

    <ReadOnlyRow label="Full Name" value={fullName || '—'} />
    <ReadOnlyRow label="Date of Birth" value={dob ?? '—'} />
    <ReadOnlyRow label="Phone" value={phone ?? '—'} />
    <ReadOnlyRow label="Address" value={address || '—'} />

    <TouchableOpacity
      onPress={onNext}
      accessibilityRole="button"
      className="w-full py-3.5 rounded-2xl flex-row justify-center items-center mt-3"
      style={{ backgroundColor: COLORS.primary }}
    >
      <Text className="text-white font-bold text-sm mr-1.5">Continue</Text>
      <ChevronRight size={16} color="#FFF" />
    </TouchableOpacity>
  </View>
);

const ReadOnlyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-row justify-between items-start py-2.5 border-b" style={{ borderColor: COLORS.border }}>
    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider">
      {label}
    </Text>
    <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold flex-1 text-right ml-4">
      {value}
    </Text>
  </View>
);

interface DocumentStepProps {
  type: KycDocType;
  doc?: ApiDocument;
  draft: DraftDoc;
  setDraft: React.Dispatch<React.SetStateAction<DraftDoc>>;
  uploading: boolean;
  onUpload: () => void;
  onRemove: () => void;
  onPreview: (side: 'front' | 'back') => void;
  onBack: () => void;
  onSkip?: () => void;
  requiresExpiry: boolean;
}

const DocumentStep: React.FC<DocumentStepProps> = ({
  type, doc, draft, setDraft, uploading, onUpload, onRemove, onPreview, onBack, onSkip, requiresExpiry,
}) => {
  const rejected = doc?.verification_status === 'rejected';
  const onFile = !!doc && !rejected;

  const attach = async (side: 'front' | 'back') => {
    const file = await pickDocument();
    if (file) setDraft((d) => ({ ...d, [side]: file }));
  };

  return (
    <View className="rounded-2xl p-4 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
      <View className="flex-row items-center justify-between mb-1">
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
          {DOC_TYPE_LABEL[type]}
        </Text>
        {doc ? (
          <Badge label={doc.verification_status} tone={VERIFICATION_TONE[doc.verification_status]} />
        ) : null}
      </View>

      {rejected && doc?.rejection_reason ? (
        <View className="px-3 py-2.5 rounded-xl mb-3 mt-2" style={{ backgroundColor: COLORS.danger + '10' }}>
          <Text style={{ color: COLORS.danger }} className="text-[10px] font-black uppercase tracking-wider mb-1">
            Rejected
          </Text>
          <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold leading-relaxed">
            {doc.rejection_reason}
          </Text>
        </View>
      ) : null}

      {onFile ? (
        <View className="mt-2">
          <DocSummaryRow doc={doc!} onPreview={() => onPreview('front')} />
          {doc!.verification_status === 'pending' ? (
            <TouchableOpacity
              onPress={onRemove}
              accessibilityRole="button"
              className="flex-row items-center justify-center px-3 py-2.5 rounded-xl mt-3"
              style={{ backgroundColor: COLORS.danger + '10' }}
            >
              <Trash2 size={13} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1.5">
                Remove & re-upload
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View className="mt-3">
          <FormField
            label="Document Number"
            required
            value={draft.doc_number}
            onChangeText={(t) => setDraft((d) => ({ ...d, doc_number: t.toUpperCase() }))}
            placeholder={type === 'driving_license' ? 'e.g. KL0120110012345' : 'e.g. ABCD1234'}
            autoCapitalize="characters"
          />

          {requiresExpiry ? (
            <FormField
              label="Expiry Date"
              required
              value={draft.expiry_date}
              onChangeText={(t) => setDraft((d) => ({ ...d, expiry_date: t }))}
              placeholder="YYYY-MM-DD"
              hint="An expired licence cannot be verified."
            />
          ) : null}

          <FileSlot
            label="Front"
            required
            file={draft.front}
            onPick={() => void attach('front')}
            onClear={() => setDraft((d) => ({ ...d, front: null }))}
          />
          <FileSlot
            label="Back (optional)"
            file={draft.back}
            onPick={() => void attach('back')}
            onClear={() => setDraft((d) => ({ ...d, back: null }))}
          />

          <TouchableOpacity
            onPress={onUpload}
            disabled={uploading}
            accessibilityRole="button"
            className="w-full py-3.5 rounded-2xl flex-row justify-center items-center mt-2"
            style={{ backgroundColor: uploading ? COLORS.gray[300] : COLORS.primary }}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Upload size={15} color="#FFF" />
                <Text className="text-white font-bold text-sm ml-2">
                  {rejected ? 'Resubmit Document' : 'Upload Document'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View className="flex-row mt-3" style={{ gap: 10 }}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          className="flex-1 py-3 rounded-2xl flex-row justify-center items-center border"
          style={{ borderColor: COLORS.border }}
        >
          <ChevronLeft size={15} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary }} className="font-bold text-xs ml-1">
            Back
          </Text>
        </TouchableOpacity>
        {onSkip ? (
          <TouchableOpacity
            onPress={onSkip}
            accessibilityRole="button"
            className="flex-1 py-3 rounded-2xl flex-row justify-center items-center"
            style={{ backgroundColor: COLORS.primary + '14' }}
          >
            <Text style={{ color: COLORS.primary }} className="font-bold text-xs mr-1">
              Next
            </Text>
            <ChevronRight size={15} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const FileSlot: React.FC<{
  label: string; file: LocalFile | null; required?: boolean;
  onPick: () => void; onClear: () => void;
}> = ({ label, file, required, onPick, onClear }) => (
  <View className="mb-3.5">
    <View className="flex-row items-center mb-1.5">
      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider">
        {label}
      </Text>
      {required ? <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1">*</Text> : null}
    </View>

    {file ? (
      <View
        className="flex-row items-center rounded-xl border p-2.5"
        style={{ backgroundColor: COLORS.background, borderColor: COLORS.primary + '55' }}
      >
        {file.mimeType.startsWith('image/') ? (
          <Image source={{ uri: file.uri }} className="w-12 h-12 rounded-lg mr-3" resizeMode="cover" />
        ) : (
          <View
            className="w-12 h-12 rounded-lg items-center justify-center mr-3"
            style={{ backgroundColor: COLORS.primary + '14' }}
          >
            <FileText size={18} color={COLORS.primary} />
          </View>
        )}
        <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-bold flex-1" numberOfLines={1}>
          {file.name}
        </Text>
        <TouchableOpacity
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          className="w-7 h-7 rounded-full items-center justify-center ml-2"
          style={{ backgroundColor: COLORS.danger + '10' }}
        >
          <X size={13} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity
        onPress={onPick}
        accessibilityRole="button"
        className="rounded-xl border border-dashed py-5 items-center justify-center"
        style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
      >
        <Upload size={18} color={COLORS.textSecondary} />
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold mt-1.5">
          Add photo or PDF
        </Text>
      </TouchableOpacity>
    )}
  </View>
);

const DocSummaryRow: React.FC<{ doc: ApiDocument; onPreview: () => void }> = ({ doc, onPreview }) => (
  <View
    className="flex-row items-center rounded-xl border p-3"
    style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
  >
    <View
      className="w-9 h-9 rounded-lg items-center justify-center mr-3"
      style={{ backgroundColor: COLORS.primary + '14' }}
    >
      <FileText size={16} color={COLORS.primary} />
    </View>
    <View className="flex-1">
      <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-extrabold">
        {DOC_TYPE_LABEL[doc.doc_type]}
      </Text>
      <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium mt-0.5">
        {doc.doc_number ?? '—'}
        {doc.expiry_date ? ` • expires ${formatDate(doc.expiry_date)}` : ''}
      </Text>
      {doc.is_expired ? (
        <Text style={{ color: COLORS.danger }} className="text-[10px] font-bold mt-0.5">
          Expired — upload a current one
        </Text>
      ) : null}
    </View>
    <Badge label={doc.verification_status} tone={VERIFICATION_TONE[doc.verification_status]} />
    <TouchableOpacity
      onPress={onPreview}
      accessibilityRole="button"
      accessibilityLabel="Preview document"
      className="w-8 h-8 rounded-lg items-center justify-center ml-2"
      style={{ backgroundColor: COLORS.card }}
    >
      <Eye size={14} color={COLORS.textSecondary} />
    </TouchableOpacity>
  </View>
);

const ReviewStep: React.FC<{
  kyc: ApiKycSummary;
  profile: { full_name: string; date_of_birth: string | null; phone: string | null } | null;
  declared: boolean; consented: boolean;
  setDeclared: (v: boolean) => void; setConsented: (v: boolean) => void;
  submitting: boolean; onSubmit: () => void; onBack: () => void;
  onPreview: (doc: ApiDocument) => void;
}> = ({ kyc, profile, declared, consented, setDeclared, setConsented, submitting, onSubmit, onBack, onPreview }) => (
  <View className="rounded-2xl p-4 border" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">
      Review & Declare
    </Text>

    <ReadOnlyRow label="Full Name" value={profile?.full_name ?? '—'} />
    <ReadOnlyRow label="Date of Birth" value={profile?.date_of_birth ?? '—'} />
    <ReadOnlyRow label="Phone" value={profile?.phone ?? '—'} />

    <View className="mt-4" style={{ gap: 10 }}>
      {kyc.documents.map((d) => (
        <DocSummaryRow key={d.id} doc={d} onPreview={() => onPreview(d)} />
      ))}
    </View>

    {kyc.missing_document_types.length > 0 ? (
      <View className="flex-row items-center mt-4 px-3 py-2.5 rounded-xl" style={{ backgroundColor: COLORS.warning + '10' }}>
        <AlertTriangle size={13} color={COLORS.warning} />
        <Text style={{ color: COLORS.warning }} className="text-[10px] font-bold ml-2 flex-1">
          Still needed: {kyc.missing_document_types.map((t) => DOC_TYPE_LABEL[t]).join(', ')}
        </Text>
      </View>
    ) : null}

    <View className="mt-4" style={{ gap: 10 }}>
      <CheckRow
        checked={declared}
        onToggle={() => setDeclared(!declared)}
        text="I declare the information and documents provided are true and belong to me."
      />
      <CheckRow
        checked={consented}
        onToggle={() => setConsented(!consented)}
        text="I consent to NR FleetHub storing and verifying these documents for identity checks."
      />
    </View>

    <View className="flex-row mt-4" style={{ gap: 10 }}>
      <TouchableOpacity
        onPress={onBack}
        accessibilityRole="button"
        className="py-3.5 px-5 rounded-2xl flex-row justify-center items-center border"
        style={{ borderColor: COLORS.border }}
      >
        <ChevronLeft size={15} color={COLORS.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSubmit}
        disabled={submitting || !kyc.can_submit}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting || !kyc.can_submit }}
        className="flex-1 py-3.5 rounded-2xl flex-row justify-center items-center"
        style={{ backgroundColor: submitting || !kyc.can_submit ? COLORS.gray[300] : COLORS.primary }}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <>
            <ShieldCheck size={16} color="#FFF" />
            <Text className="text-white font-bold text-sm ml-2">Submit for Review</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  </View>
);

const CheckRow: React.FC<{ checked: boolean; onToggle: () => void; text: string }> = ({
  checked, onToggle, text,
}) => (
  <TouchableOpacity
    onPress={onToggle}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    className="flex-row items-start"
  >
    <View
      className="w-5 h-5 rounded-md items-center justify-center mr-3 mt-0.5 border"
      style={{
        backgroundColor: checked ? COLORS.primary : COLORS.background,
        borderColor: checked ? COLORS.primary : COLORS.border,
      }}
    >
      {checked ? <Check size={12} color="#FFF" /> : null}
    </View>
    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium flex-1 leading-relaxed">
      {text}
    </Text>
  </TouchableOpacity>
);

const PreviewModal: React.FC<{
  preview: { url: string; isPdf: boolean } | null;
  onClose: () => void;
}> = ({ preview, onClose }) => (
  <Modal visible={!!preview} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.92)' }} className="items-center justify-center px-5">
      <TouchableOpacity
        onPress={onClose}
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
          <Text className="text-white font-bold text-sm mt-4 text-center">PDF document</Text>
          <Text className="text-white/70 font-medium text-[11px] mt-2 text-center px-8 leading-relaxed">
            PDFs can't be shown inline yet. The signed link expires in a few minutes and is
            never saved to your device.
          </Text>
        </View>
      ) : preview ? (
        <Image
          source={{ uri: preview.url }}
          style={{ width: '100%', height: '75%', borderRadius: 16 }}
          resizeMode="contain"
        />
      ) : null}
    </View>
  </Modal>
);
