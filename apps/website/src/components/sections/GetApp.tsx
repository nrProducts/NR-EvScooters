import { Smartphone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { HAS_APP_LINKS, PLAY_STORE_URL, APP_STORE_URL } from "@/content/links";
import { cn } from "@/lib/utils";

/**
 * Booking, KYC, and payment all happen in the Swapngo mobile app (Expo,
 * no live rider web flow) — so every "Book Now" CTA on this static site
 * lands here rather than a booking screen that doesn't exist yet.
 */
export function GetApp() {
  return (
    <section id="get-app" className="py-14 sm:py-20">
      <Container>
        <div className="rounded-2xl bg-primary px-6 py-14 text-center sm:px-14">
          <Smartphone className="mx-auto h-10 w-10 text-primary-foreground" aria-hidden />
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
            Get the Swapngo app
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-foreground/90">
            Booking, KYC, and payments all happen in the app. Download it to book your first ride.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <StoreBadge label="Google Play" href={PLAY_STORE_URL} />
            <StoreBadge label="App Store" href={APP_STORE_URL} />
          </div>

          {!HAS_APP_LINKS && (
            <p className="mt-5 text-xs font-medium uppercase tracking-wide text-primary-foreground/80">
              Coming soon — links go live at launch
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}

function StoreBadge({ label, href }: { label: string; href: string }) {
  const disabled = !href;
  const Comp = disabled ? "span" : "a";
  return (
    <Comp
      href={href || undefined}
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-foreground shadow-soft",
        disabled ? "cursor-not-allowed opacity-60" : "transition-transform duration-200 hover:-translate-y-0.5",
      )}
      aria-disabled={disabled}
    >
      {disabled ? `${label} — coming soon` : label}
    </Comp>
  );
}
