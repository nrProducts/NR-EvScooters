import { Mail, Phone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { FleetPageHero } from "@/components/fleet/FleetBlocks";
import { DemoForm } from "@/components/fleet/DemoForm";
import { CONTACT_EMAIL, CONTACT_PHONES } from "@/content/contact";
import { trackEvent } from "@/lib/analytics";

const STEPS = [
  { title: "You send the form", text: "Tell us about your fleet and what you want to see." },
  { title: "We walk you through it", text: "A live tour of the admin console and rider app against your use case." },
  { title: "You get price details", text: "For the monthly subscription or the one-time purchase, whichever you prefer." },
];

export function FleetDemoPage() {
  return (
    <>
      <FleetPageHero
        eyebrow="Request a demo"
        title="Request a fleet management software demo"
        description="See SwapNgo Fleet working, ask questions about your own fleet, and ask for price details. There is no obligation to buy."
      />

      <section className="pb-14 sm:pb-20">
        <Container className="grid items-start gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
          <Reveal>
            <DemoForm />
          </Reveal>

          <Reveal delay={120} className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground">What happens next</h2>
              <ol className="mt-5 space-y-5">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{s.title}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{s.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-3xl border border-border bg-sage/50 p-6">
              <h2 className="text-lg font-semibold text-foreground">Prefer to talk first?</h2>
              <div className="mt-4 space-y-2.5">
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("SwapNgo Fleet enquiry")}`}
                  onClick={() => trackEvent("click_email", { placement: "fleet_demo_page" })}
                  className="flex min-h-[44px] items-center gap-3 text-[15px] font-medium text-foreground hover:text-primary"
                >
                  <Mail className="h-4 w-4 text-primary" aria-hidden />
                  {CONTACT_EMAIL}
                </a>
                {CONTACT_PHONES.map((p) => (
                  <a
                    key={p.href}
                    href={p.href}
                    onClick={() => trackEvent("click_phone", { placement: "fleet_demo_page" })}
                    className="flex min-h-[44px] items-center gap-3 text-[15px] font-medium text-foreground hover:text-primary"
                  >
                    <Phone className="h-4 w-4 text-primary" aria-hidden />
                    {p.display}
                  </a>
                ))}
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
