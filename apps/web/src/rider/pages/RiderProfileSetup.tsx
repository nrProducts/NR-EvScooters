import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/common/Spinner";
import { ApiError } from "@/services/api/httpClient";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { riderApi } from "@/rider/services/riderApi";
import { isValidPhone, toE164 } from "@/rider/lib/authValidation";
import { INDIAN_STATES } from "@/rider/constants/indianStates";
import { Logo } from "@/rider/components/Logo";
import type { Gender } from "@/rider/types/api";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function isValidDob(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d >= new Date()) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age >= 18 && age <= 120;
}

const field = "space-y-1.5";
const lbl = "text-sm font-semibold";

export default function RiderProfileSetup() {
  const navigate = useNavigate();
  const profile = useRiderAuthStore((s) => s.profile);
  const refreshProfile = useRiderAuthStore((s) => s.refreshProfile);

  const showPhoneField = !!profile?.email && !profile?.phone;

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [dob, setDob] = useState(profile?.date_of_birth ?? "");
  const [gender, setGender] = useState<string>(profile?.gender ?? "");
  const [addressLine1, setAddressLine1] = useState(profile?.address_line_1 ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [state, setStateVal] = useState(profile?.state ?? "");
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (saving) return;
    if (fullName.trim().length < 2 || !/^[A-Za-z\s'-]+$/.test(fullName.trim())) {
      setError("Enter your full name (letters, spaces, apostrophes and hyphens only).");
      return;
    }
    if (!showPhoneField && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (showPhoneField && !isValidPhone(phone)) {
      setError("Enter a valid phone number, e.g. 98765 43210.");
      return;
    }
    if (!gender) return setError("Select a gender.");
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      return setError("Fill in your full address.");
    }
    if (!isValidDob(dob.trim())) return setError("Use YYYY-MM-DD; you must be at least 18.");

    setError("");
    setSaving(true);
    try {
      await riderApi.updateMe({
        full_name: fullName.trim(),
        ...(showPhoneField ? { phone: toE164(phone) } : { email: email.trim().toLowerCase() }),
        date_of_birth: dob.trim(),
        gender: gender as Gender,
        address_line_1: addressLine1.trim(),
        city: city.trim(),
        state: state.trim(),
        postal_code: postalCode.trim(),
      });
      await refreshProfile();
      navigate("/rider", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <div
        className="mx-auto max-w-[440px] px-6 pb-16 pt-10"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3rem)" }}
      >
        <Logo className="mb-8" />
        <h1 className="text-2xl font-bold">Complete your profile</h1>
        <p className="mb-8 mt-2 text-sm text-muted-foreground">
          A few details so we can set your account up properly. You can update these later.
        </p>

        <div className="space-y-4">
        <div className={field}>
          <label className={lbl}>Full Name</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
        </div>

        {showPhoneField ? (
          <div className={field}>
            <label className={lbl}>Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" inputMode="tel" />
          </div>
        ) : (
          <div className={field}>
            <label className={lbl}>Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          </div>
        )}

        <div className={field}>
          <label className={lbl}>Date of Birth</label>
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          <p className="text-xs text-muted-foreground">You must be at least 18 to ride.</p>
        </div>

        <div className={field}>
          <label className={lbl}>Gender</label>
          <select
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option value="">Select…</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>

        <div className={field}>
          <label className={lbl}>Address</label>
          <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className={field}>
            <label className={lbl}>City</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          </div>
          <div className={field}>
            <label className={lbl}>State</label>
            <select
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={state}
              onChange={(e) => setStateVal(e.target.value)}
            >
              <option value="">Select…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.key} value={s.label}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className={field}>
          <label className={lbl}>Postal Code</label>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" inputMode="numeric" />
        </div>

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}

        <Button className="h-12 w-full text-base" onClick={save} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : "Continue"}
        </Button>
        </div>
      </div>
    </div>
  );
}
