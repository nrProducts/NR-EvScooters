import { useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, AlertCircle, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

const QUERY_TYPES = [
  { value: "general", label: "General Enquiry" },
  { value: "rental", label: "Scooter Rental" },
  { value: "pricing", label: "Pricing & Plans" },
  { value: "booking", label: "Booking" },
  { value: "partnership", label: "Partnership" },
  { value: "vehicle", label: "Vehicle / Scooter" },
  { value: "payment", label: "Payment" },
  { value: "technical", label: "Technical Support" },
  { value: "feedback", label: "Feedback" },
  { value: "other", label: "Other" },
] as const;

const CONTACT_METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

interface FormValues {
  full_name: string;
  email: string;
  phone: string;
  query_type: string;
  message: string;
  preferred_contact: string;
  /** Honeypot — always empty for a real visitor. */
  company: string;
}

const EMPTY: FormValues = {
  full_name: "",
  email: "",
  phone: "",
  query_type: "general",
  message: "",
  preferred_contact: "",
  company: "",
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

/**
 * Mirrors apps/backend/src/modules/public/public.validation.ts so a visitor
 * sees the problem before a round trip. The server re-checks every rule — this
 * copy is UX, never the control.
 */
function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (values.full_name.trim().length < 2) errors.full_name = "Enter your full name.";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  const digits = values.phone.replace(/[\s()+.-]/g, "");
  if (!/^(?:91|0)?[6-9]\d{9}$/.test(digits)) {
    errors.phone = "Enter a valid 10-digit Indian mobile number.";
  }

  if (!QUERY_TYPES.some((t) => t.value === values.query_type)) {
    errors.query_type = "Choose a query type.";
  }

  const message = values.message.trim();
  if (message.length < MESSAGE_MIN) {
    errors.message = `Please write at least ${MESSAGE_MIN} characters.`;
  } else if (message.length > MESSAGE_MAX) {
    errors.message = `Please keep your message under ${MESSAGE_MAX} characters.`;
  }

  return errors;
}

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const formId = useId();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState("");
  /**
   * Guards against a double submit that React state alone can't: two clicks
   * in the same tick both read the pre-update `status`.
   */
  const inFlight = useRef(false);
  const errorSummaryRef = useRef<HTMLParagraphElement>(null);

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
      // Clear this field's error as soon as it is touched — re-validating on
      // every keystroke would scold someone halfway through typing an address.
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

      const res = await fetch(`${API_BASE}/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.full_name,
          email: values.email,
          phone: values.phone,
          query_type: values.query_type,
          message: values.message,
          // Omitted rather than sent empty — the field is optional server-side.
          ...(values.preferred_contact ? { preferred_contact: values.preferred_contact } : {}),
          company: values.company,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string; fields?: Record<string, string> }
          | null;

        // 400s carry per-field messages the visitor can act on; everything
        // else gets one neutral line. Their input is left in place either way.
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
            ? "You have sent several messages already. Please try again in a few minutes."
            : "Unable to submit your query right now. Please try again in a few minutes.",
        );
        errorSummaryRef.current?.focus();
        return;
      }

      setValues(EMPTY);
      setStatus("success");
    } catch {
      console.error("Contact form submission failed");
      setStatus("error");
      setFormError("Unable to submit your query right now. Please try again in a few minutes.");
      errorSummaryRef.current?.focus();
    } finally {
      inFlight.current = false;
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-primary/30 bg-secondary/50 p-8 text-center"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">Thank you for contacting Swapngo!</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your query has been submitted successfully. Our team will get back to you soon.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Send another query
        </button>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8"
    >
      {/*
        Honeypot. Hidden from sight AND from assistive tech, and never
        focusable, so no real visitor can fill it in by accident.
      */}
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

      <div className={cn("grid gap-5 sm:grid-cols-2", formError && "mt-5")}>
        <Field label="Full Name" required error={errors.full_name} htmlFor={`${formId}-full_name`}>
          <input
            {...field("full_name")}
            type="text"
            autoComplete="name"
            placeholder="Enter your full name"
            maxLength={100}
            className={inputClass(!!errors.full_name)}
          />
        </Field>

        <Field label="Email Address" required error={errors.email} htmlFor={`${formId}-email`}>
          <input
            {...field("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Enter your email address"
            maxLength={254}
            className={inputClass(!!errors.email)}
          />
        </Field>

        <Field label="Phone Number" required error={errors.phone} htmlFor={`${formId}-phone`}>
          <input
            {...field("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Enter your phone number"
            maxLength={20}
            className={inputClass(!!errors.phone)}
          />
        </Field>

        <Field label="Query Type" required error={errors.query_type} htmlFor={`${formId}-query_type`}>
          <select {...field("query_type")} className={inputClass(!!errors.query_type)}>
            {QUERY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Message" required error={errors.message} htmlFor={`${formId}-message`}>
            <textarea
              {...field("message")}
              rows={5}
              placeholder="Tell us how we can help you..."
              maxLength={MESSAGE_MAX}
              className={cn(inputClass(!!errors.message), "min-h-[8rem] resize-y py-3")}
            />
            <p className="mt-1.5 text-right text-xs text-muted-foreground">
              {values.message.trim().length} / {MESSAGE_MAX}
            </p>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <fieldset>
            <legend className="text-sm font-medium text-foreground">
              Preferred Contact Method{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {CONTACT_METHODS.map((m) => {
                const checked = values.preferred_contact === m.value;
                return (
                  <label
                    key={m.value}
                    className={cn(
                      "cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
                      checked
                        ? "border-primary bg-secondary text-secondary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="preferred_contact"
                      value={m.value}
                      checked={checked}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, preferred_contact: e.target.value }))
                      }
                      className="sr-only"
                    />
                    {m.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="mt-7 flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Required fields
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden />
              Submit Query
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function inputClass(invalid: boolean): string {
  return cn(
    "h-11 w-full rounded-xl border bg-background px-3.5 text-sm text-foreground",
    "placeholder:text-muted-foreground/70",
    "transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
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
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
