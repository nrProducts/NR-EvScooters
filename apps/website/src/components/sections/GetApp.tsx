import { ArrowRight, Smartphone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { HAS_APP_LINKS, PLAY_STORE_URL, APP_STORE_URL } from "@/content/links";

/**
 * Booking, KYC, and payment all happen in the Swapngo mobile app (Expo,
 * no live rider web flow) — so every "Book a Scooter" CTA on this static
 * site lands here rather than a booking screen that doesn't exist yet.
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
          Book your Swapngo EV and start riding — booking, KYC, and payments all happen in the app.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="#pricing" size="lg">
            Book a Scooter
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <AppLink label="Google Play" href={PLAY_STORE_URL} />
          <AppLink label="App Store" href={APP_STORE_URL} />
        </div>

        {/* Neither store link is configured yet — say so rather than assume which
            platform ships first; PLAY_STORE_URL/APP_STORE_URL are the source of truth. */}
        {!HAS_APP_LINKS && <Badge tone="dark" className="mt-6">App — coming soon</Badge>}
      </Container>
    </section>
  );
}

function AppLink({ label, href }: { label: string; href: string }) {
  if (!href) return null;
  return (
    <Button href={href} variant="outline-dark" size="lg">
      Download App — {label}
    </Button>
  );
}
