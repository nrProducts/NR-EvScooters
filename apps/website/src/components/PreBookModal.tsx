import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, AlertCircle, Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const PLAN_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "not_sure", label: "Not Sure Yet" },
] as const;

const MESSAGE_MAX = 1000;

interface FormValues {
  full_name: string;
  phone: string;
  location: string;
  email: string;
  plan_preference: string;
  message: string;
  /** Honeypot — always empty for a real visitor. */
  company: string;
}

const EMPTY: FormValues = {
  full_name: "",
  phone: "",
  location: "",
  email: "",
  plan_preference: "not_sure",
  message: "",
  company: "",
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

/**
 * Mirrors apps/backend/src/modules/public/public.validation.ts's
 * preBookingBody so a visitor sees a problem before a round trip — the
 * server re-checks every rule; this copy is UX, never the control.
 */
function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (values.full_name.trim().length < 2) errors.full_name = "Enter your full name.";

  const digits = values.phone.replace(/[\s()+.-]/g, "");
  if (!/^(?:91|0)?[6-9]\d{9}$/.test(digits)) {
    errors.phone = "Enter a valid 10-digit Indian mobile number.";
  }

  if (values.location.trim().length < 2) errors.location = "Enter your location or area.";

  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (values.message.trim().length > MESSAGE_MAX) {
    errors.message = `Please keep this under ${MESSAGE_MAX} characters.`;
  }

  return errors;
}

type Status = "idle" | "submitting" | "success" | "error";

export function PreBookModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const formId = useId();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState("");
  /** Guards a double submit that React state alone can't — two clicks in the same tick both read the pre-update status. */
  const inFlight = useRef(false);
  const errorSummaryRef = useRef<HTMLParagraphElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset to a clean form each time the modal is reopened, but only after its
  // close animation would have finished — resetting while `open` is still
  // true (e.g. mid-close) would flash the success screen back to the form.
  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
      setStatus("idle");
      setFormError("");
      // Wait a tick for the panel to mount before focusing it.
      const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape to close, scroll lock while open — same baseline as the mobile
  // nav drawer in Header.tsx, without that drawer's back-gesture history
  // trick, which a dismissible dialog doesn't need.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const field = (name: keyof FormValues) => ({
    id: `${formId}-${name}`,
    name,
    value: values[name],
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `${formId}-${name}-error` : undefined,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    },
  });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;

    const found = validate(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStatus("error");
      setFormError("Please correct the highlighted fields.");
      errorSummaryRef.current?.focus();
      return;
    }

    inFlight.current = true;
    setErrors({});
    setFormError("");
    setStatus("submitting");

    try {
      if (!API_BASE) throw new Error("api-not-configured");

      const res = await fetch(`${API_BASE}/public/pre-book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.full_name,
          phone: values.phone,
          location: values.location,
          ...(values.email.trim() ? { email: values.email.trim() } : {}),
          plan_preference: values.plan_preference,
          ...(values.message.trim() ? { message: values.message.trim() } : {}),
          company: values.company,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string; fields?: Record<string, string> }
          | null;

        if (res.status === 400 && payload?.fields) {
          setErrors(payload.fields as FieldErrors);
          setStatus("error");
          setFormError(payload.message ?? "Please correct the highlighted fields.");
          errorSummaryRef.current?.focus();
          return;
        }

        setStatus("error");
        setFormError(
          res.status === 429
            ? "You've already sent a pre-booking request. Our team will be in touch soon."
            : "We couldn't submit your request right now. Please try again or contact Swapngo directly.",
        );
        errorSummaryRef.current?.focus();
        return;
      }

      trackEvent("pre_book_submit", { plan_preference: values.plan_preference });
      setStatus("success");
    } catch {
      console.error("Pre-booking submission failed");
      setStatus("error");
      setFormError("We couldn't submit your request right now. Please try again or contact Swapngo directly.");
      errorSummaryRef.current?.focus();
    } finally {
      inFlight.current = false;
    }
  }

  const submitting = status === "submitting";
  const success = status === "success";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-near-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-6 sm:max-w-lg sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        {success ? (
          <div role="status" className="pt-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage">
              <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <h3 id={`${formId}-title`} className="mt-4 text-lg font-semibold text-foreground">
              Pre-booking submitted successfully!
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Thank you for your interest in Swapngo. Our team will contact you when vehicles are
              available in your area.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 id={`${formId}-title`} className="pr-8 text-xl font-semibold text-foreground sm:text-2xl">
              Pre-Book Your Swapngo Ride
            </h3>
            <p className="mt-2 pr-8 text-sm leading-relaxed text-muted-foreground">
              Our fleet is getting ready! Pre-book your ride and we&rsquo;ll contact you when
              Swapngo is available in your area.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-6">
              {/* Honeypot — hidden from sight and from assistive tech, never focusable. */}
              <div aria-hidden className="absolute h-px w-px overflow-hidden opacity-0">
                <label htmlFor={`${formId}-company`}>Company</label>
                <input
                  id={`${formId}-company`}
                  name="company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={values.company}
                  onChange={(e) => setValues((v) => ({ ...v, company: e.target.value }))}
                />
              </div>

              <p
                ref={errorSummaryRef}
                tabIndex={-1}
                role={formError ? "alert" : undefined}
                className={cn(
                  "flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive",
                  !formError && "hidden",
                )}
              >
                {formError && (
                  <>
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{formError}</span>
                  </>
                )}
              </p>

              <div className={cn("grid gap-4", formError && "mt-3")}>
                <Field label="Full Name" required error={errors.full_name} htmlFor={`${formId}-full_name`}>
                  <input
                    {...field("full_name")}
                    ref={firstFieldRef}
                    type="text"
                    autoComplete="name"
                    placeholder="Enter your full name"
                    maxLength={100}
                    className={inputClass(!!errors.full_name)}
                  />
                </Field>

                <Field label="Mobile Number" required error={errors.phone} htmlFor={`${formId}-phone`}>
                  <input
                    {...field("phone")}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="10-digit mobile number"
                    maxLength={16}
                    className={inputClass(!!errors.phone)}
                  />
                </Field>

                <Field label="Location / Area" required error={errors.location} htmlFor={`${formId}-location`}>
                  <input
                    {...field("location")}
                    type="text"
                    autoComplete="address-level2"
                    placeholder="e.g. Medavakkam, Chennai"
                    maxLength={150}
                    className={inputClass(!!errors.location)}
                  />
                </Field>

                <Field label="Email Address" error={errors.email} htmlFor={`${formId}-email`}>
                  <input
                    {...field("email")}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="Enter your email address (optional)"
                    maxLength={254}
                    className={inputClass(!!errors.email)}
                  />
                </Field>

                <Field label="Preferred Rental Plan" htmlFor={`${formId}-plan_preference`}>
                  <select {...field("plan_preference")} className={inputClass(false)}>
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Message / Requirements" error={errors.message} htmlFor={`${formId}-message`}>
                  <textarea
                    {...field("message")}
                    rows={3}
                    placeholder="Anything else we should know? (optional)"
                    maxLength={MESSAGE_MAX}
                    className={cn(inputClass(!!errors.message), "min-h-[5rem] resize-y py-2.5")}
                  />
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    {values.message.trim().length} / {MESSAGE_MAX}
                  </p>
                </Field>
              </div>

              <div className="mt-6 flex flex-col items-center gap-2.5">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" aria-hidden />
                      Submit Pre-Booking
                    </>
                  )}
                </button>
                <p className="text-xs text-muted-foreground">
                  <span className="text-destructive">*</span> Required fields
                </p>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function inputClass(invalid: boolean): string {
  return cn(
    // 16px on phones is deliberate: iOS Safari zooms the viewport when a
    // focused input is under 16px, and the page never recovers the zoom.
    "h-11 w-full rounded-xl border bg-muted px-3 text-[16px] text-foreground sm:text-sm",
    "placeholder:text-muted-foreground/70",
    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
    invalid ? "border-destructive" : "border-border hover:border-primary/40",
  );
}

function Field({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      <div className="mt-1">{children}</div>
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
