import type { LucideIcon } from "lucide-react";
import { ArrowRight, Smartphone, Globe } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PLAY_STORE_URL, ADMIN_CONSOLE_URL } from "@/content/links";
import { cn } from "@/lib/utils";

/**
 * Booking, KYC, and payment all happen in the Swapngo mobile app (Expo,
 * Android-only for now). There's no iOS app planned — iPhone riders are
 * meant to use the rider role inside apps/web instead (the same login form
 * used by staff — it detects a rider account and routes to /rider
 * automatically, see LoginPage.tsx). Both platforms are shown as equal,
 * parallel options here rather than one primary CTA plus a buried fallback,
 * since neither path is more "correct" than the other for a given rider.
 */
export function GetApp() {
  return (
    <section id="get-app" className="relative overflow-hidden bg-dark py-12 sm:py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-[0.06]" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-[130px]" />

      <Container className="relative text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <Smartphone className="h-7 w-7 text-primary" aria-hidden />
        </div>

        <h2 className="mx-auto mt-7 max-w-xl text-balance text-section-mobile font-extrabold tracking-tight text-white sm:text-section">
          Ready to move?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-white/70">
          Book your Swapngo EV and start riding — booking, KYC, and payments all happen wherever
          you ride from.
        </p>

        <div className="mx-auto mt-9 grid max-w-xl gap-4 sm:grid-cols-2">
          <PlatformButton
            icon={Smartphone}
            eyebrow="Android"
            label={PLAY_STORE_URL ? "Get the app" : "Coming soon"}
            href={PLAY_STORE_URL}
            disabled={!PLAY_STORE_URL}
          />
          <PlatformButton icon={Globe} eyebrow="iPhone" label="Ride from your browser" href={ADMIN_CONSOLE_URL} external />
        </div>
      </Container>
    </section>
  );
}

function PlatformButton({
  icon: Icon,
  eyebrow,
  label,
  href,
  disabled,
  external,
}: {
  icon: LucideIcon;
  eyebrow: string;
  label: string;
  href: string;
  disabled?: boolean;
  external?: boolean;
}) {
  const Comp = disabled ? "span" : "a";
  return (
    <Comp
      href={disabled ? undefined : href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      aria-disabled={disabled}
      className={cn(
        "group flex items-center gap-4 rounded-2xl border border-white/15 bg-white/5 px-6 py-5 text-left backdrop-blur transition-all duration-200",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/10",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </span>
      <span className="flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-white/50">{eyebrow}</span>
        <span className="block text-base font-bold text-white">{label}</span>
      </span>
      {!disabled && (
        <ArrowRight
          className="h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden
        />
      )}
    </Comp>
  );
}
