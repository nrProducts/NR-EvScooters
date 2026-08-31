import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api/httpClient";
import { CenteredSpinner } from "@/rider/components/common";
import { Logo } from "@/rider/components/Logo";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { riderApi } from "@/rider/services/riderApi";
import { CONSENT_PURPOSE_LABEL } from "@/rider/constants/consent";
import type { ConsentPurpose } from "@/rider/types/api";

/**
 * DPDPA notice-and-consent capture (ss.5-6). Shown between profile setup and
 * KYC, and again whenever a new notice version is published. The KYC upload
 * endpoint refuses a document without `kyc_identity_verification` consent on
 * record, so this gate is mandatory before the KYC wizard.
 */
export default function RiderConsent() {
  const navigate = useNavigate();
  const refreshProfile = useRiderAuthStore((s) => s.refreshProfile);

  const stateQ = useQuery({ queryKey: ["rider", "consents"], queryFn: () => riderApi.myConsents() });
  const noticeQ = useQuery({ queryKey: ["rider", "consent-notice"], queryFn: () => riderApi.consentNotice("en") });

  const [optional, setOptional] = useState<Record<string, boolean>>({});
  const [declared, setDeclared] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = stateQ.data;
  const notice = noticeQ.data;

  useEffect(() => {
    if (!state) return;
    const seed: Record<string, boolean> = {};
    for (const item of state.items) if (!item.required) seed[item.purpose] = item.granted;
    setOptional(seed);
  }, [state]);

  const required = useMemo(() => state?.items.filter((i) => i.required) ?? [], [state]);
  const optionalItems = useMemo(() => state?.items.filter((i) => !i.required) ?? [], [state]);

  if (stateQ.isLoading || noticeQ.isLoading) return <CenteredSpinner label="Loading privacy settings…" />;
  if (!state || !notice) {
    return <p className="p-8 text-center text-sm text-destructive">Could not load the privacy notice.</p>;
  }

  const accept = async () => {
    setError(null);
    setSaving(true);
    try {
      const grants = [
        ...required.map((i) => ({ purpose: i.purpose, granted: true })),
        ...optionalItems.map((i) => ({ purpose: i.purpose, granted: optional[i.purpose] ?? false })),
      ];
      await riderApi.setConsents({ notice_version: notice.version, language: "en", grants });
      await refreshProfile();
      navigate("/rider/kyc", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("The privacy notice was updated. Please review it again.");
        stateQ.refetch();
        noticeQ.refetch();
      } else {
        setError(err instanceof ApiError ? err.message : "Could not save your choices.");
      }
    } finally {
      setSaving(false);
    }
  };

  const label = (p: ConsentPurpose) => CONSENT_PURPOSE_LABEL[p] ?? { title: p, summary: "" };

  return (
    <div className="min-h-[100dvh] bg-background">
      <div
        className="mx-auto max-w-[440px] px-6 pt-10"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3rem)" }}
      >
        <Logo className="mb-8" />
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">Your privacy</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          Before you upload an ID document we need your consent for how we use your data. You stay in control
          — manage or withdraw consent any time from Account.
        </p>

        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Required to use SwapNgo
        </div>
        <div className="mb-6 divide-y divide-border rounded-lg border border-border">
          {required.map((i) => (
            <div key={i.purpose} className="p-3.5">
              <p className="text-sm font-semibold">{label(i.purpose).title}</p>
              <p className="text-xs text-muted-foreground">{label(i.purpose).summary}</p>
            </div>
          ))}
        </div>

        {optionalItems.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Optional</p>
            <div className="mb-4 space-y-3">
              {optionalItems.map((i) => (
                <div key={i.purpose} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3.5">
                  <div>
                    <p className="text-sm font-semibold">{label(i.purpose).title}</p>
                    <p className="text-xs text-muted-foreground">{label(i.purpose).summary}</p>
                  </div>
                  <Switch
                    checked={optional[i.purpose] ?? false}
                    onCheckedChange={(v) => setOptional((prev) => ({ ...prev, [i.purpose]: v }))}
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => setShowNotice((v) => !v)}
          className="flex items-center gap-1 py-3 text-xs font-bold text-primary"
        >
          {showNotice ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Read the full privacy notice
        </button>
        {showNotice && (
          <div className="mb-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            {notice.body}
          </div>
        )}
        <p className="mb-5 text-[10px] font-semibold text-muted-foreground">
          Notice v{notice.version} · effective {new Date(notice.effective_from).toLocaleDateString()}
        </p>

        {error && (
          <p className="mb-3 rounded-lg border border-destructive bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        <label className="mb-4 flex items-start gap-2 text-xs">
          <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-0.5" />
          I have read the notice and consent to the required purposes above.
        </label>

        <Button className="h-12 w-full text-base" disabled={saving || !declared} onClick={accept}>
          {saving ? "Saving…" : "Agree & continue"}
        </Button>
      </div>
    </div>
  );
}
