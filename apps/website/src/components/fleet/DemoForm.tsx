import { useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, AlertCircle, Loader2, Send } from "lucide-react";
import { Field, inputClass } from "@/components/ContactForm";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useLocation } from "@/lib/router";
import {
  BUSINESS_TYPE_OPTIONS,
  FLEET_SIZE_OPTIONS,
  PRICING_INTEREST_OPTIONS,
} from "@/content/fleet";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

interface Values {
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  business_type: string;
  fleet_size: string;
  pricing_interest: string;
  message: string;
  /** Honeypot — always empty for a real visitor. */
  company: string;
}

type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = {
  full_name: "",
  email: "",
  phone: "",
  business_name: "",
  business_type: "",
  fleet_size: "",
  pricing_interest: "not_sure",
  message: "",
  company: "",
};

/** Mirrors the server schema for UX; the server re-validates every rule. */
function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.full_name.trim().length < 2) e.full_name = "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = "Enter a valid email address.";
  const digits = v.phone.replace(/[\s()+.-]/g, "");
  if (!/^(?:91|0)?[6-9]\d{9}$/.test(digits)) e.phone = "Enter a valid 10-digit Indian mobile number.";
  if (v.business_name.trim().length < 2) e.business_name = "Enter your business name.";
  if (!BUSINESS_TYPE_OPTIONS.some((o) => o.value === v.business_type)) e.business_type = "Choose your business type.";
  if (!FLEET_SIZE_OPTIONS.some((o) => o.value === v.fleet_size)) e.fleet_size = "Choose your fleet size.";
  const m = v.message.trim();
  if (m.length < MESSAGE_MIN) e.message = `Please write at least ${MESSAGE_MIN} characters.`;
  else if (m.length > MESSAGE_MAX) e.message = `Please keep your message under ${MESSAGE_MAX} characters.`;
  return e;
}

type Status = "idle" | "submitting" | "success" | "error";

export function DemoForm() {
  const formId = useId();
  const { search } = useLocation();
  // /request-demo?plan=monthly | one-time — set by the pricing CTAs.
  const plan = new URLSearchParams(search).get("plan");
  const initialInterest = plan === "monthly" ? "monthly" : plan === "one-time" ? "one_time" : "not_sure";

  const [values, setValues] = useState<Values>({ ...EMPTY, pricing_interest: initialInterest });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState("");
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const field = (name: keyof Values) => ({
    id: `${formId}-${name}`,
    name,
    value: values[name],
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `${formId}-${name}-error` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
      errorRef.current?.focus();
      return;
    }

    inFlight.current = true;
    setErrors({});
    setFormError("");
    setStatus("submitting");

    try {
      if (!API_BASE) throw new Error("api-not-configured");
      const res = await fetch(`${API_BASE}/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-App": "website" },
        body: JSON.stringify({
          full_name: values.full_name,
          email: values.email,
          phone: values.phone,
          query_type: "fleet_demo",
          message: values.message,
          business_name: values.business_name,
          business_type: values.business_type,
          fleet_size: values.fleet_size,
          pricing_interest: values.pricing_interest,
          company: values.company,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string; error?: { fields?: Record<string, string> }; fields?: Record<string, string> }
          | null;
        const fields = payload?.fields ?? payload?.error?.fields;
        if (res.status === 400 && fields) {
          setErrors(fields as Errors);
          setStatus("error");
          setFormError(payload?.message ?? "Please correct the highlighted fields.");
          errorRef.current?.focus();
          return;
        }
        setStatus("error");
        setFormError(
          res.status === 429
            ? "You have sent several messages already. Please try again in a few minutes."
            : "Unable to submit your request right now. Please try again in a few minutes, or email us directly.",
        );
        errorRef.current?.focus();
        return;
      }

      // Fixed-list values only — never name, email, phone or message text.
      trackEvent("demo_request_submit", {
        business_type: values.business_type,
        fleet_size: values.fleet_size,
        pricing_interest: values.pricing_interest,
      });
      setValues({ ...EMPTY, pricing_interest: initialInterest });
      setStatus("success");
    } catch {
      console.error("Demo request submission failed");
      setStatus("error");
      setFormError("Unable to submit your request right now. Please try again in a few minutes, or email us directly.");
      errorRef.current?.focus();
    } finally {
      inFlight.current = false;
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-3xl border border-primary/30 bg-secondary/50 p-8 text-center sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage">
          <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Thanks. We have your demo request.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Our team will get back to you to arrange a walkthrough of SwapNgo Fleet.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-semibold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Send another request
        </button>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
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
        ref={errorRef}
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

      <div className={cn("grid gap-4 sm:grid-cols-2", formError && "mt-3")}>
        <Field label="Full Name" required error={errors.full_name} htmlFor={`${formId}-full_name`}>
          <input {...field("full_name")} type="text" autoComplete="name" placeholder="Your full name" maxLength={100} className={inputClass(!!errors.full_name)} />
        </Field>
        <Field label="Work Email" required error={errors.email} htmlFor={`${formId}-email`}>
          <input {...field("email")} type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" maxLength={254} className={inputClass(!!errors.email)} />
        </Field>
        <Field label="Phone Number" required error={errors.phone} htmlFor={`${formId}-phone`}>
          <input {...field("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" maxLength={20} className={inputClass(!!errors.phone)} />
        </Field>
        <Field label="Business Name" required error={errors.business_name} htmlFor={`${formId}-business_name`}>
          <input {...field("business_name")} type="text" autoComplete="organization" placeholder="Your company" maxLength={150} className={inputClass(!!errors.business_name)} />
        </Field>
        <Field label="Business Type" required error={errors.business_type} htmlFor={`${formId}-business_type`}>
          <select {...field("business_type")} className={inputClass(!!errors.business_type)}>
            <option value="">Select your business</option>
            {BUSINESS_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Fleet Size" required error={errors.fleet_size} htmlFor={`${formId}-fleet_size`}>
          <select {...field("fleet_size")} className={inputClass(!!errors.fleet_size)}>
            <option value="">Select fleet size</option>
            {FLEET_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Pricing Model You Are Considering" htmlFor={`${formId}-pricing_interest`}>
            <select {...field("pricing_interest")} className={inputClass(false)}>
              {PRICING_INTEREST_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="What would you like to see?" required error={errors.message} htmlFor={`${formId}-message`}>
            <textarea
              {...field("message")}
              rows={4}
              placeholder="Tell us about your fleet and what you want to manage with SwapNgo Fleet."
              maxLength={MESSAGE_MAX}
              className={cn(inputClass(!!errors.message), "min-h-[7rem] resize-y py-2.5")}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {values.message.trim().length} / {MESSAGE_MAX}
            </p>
          </Field>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse items-center gap-2.5 sm:flex-row sm:justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Required fields
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden />
              Request a Demo
            </>
          )}
        </button>
      </div>
    </form>
  );
}
