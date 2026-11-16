import { ArrowRight, Bike, LayoutDashboard, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { Blob } from "@/components/ui/Blob";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/lib/router";
import { CONTACT_ADDRESS, SERVICE_CITY } from "@/content/contact";

export function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-background">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />
        <Blob tone="sage" className="-right-40 -top-40 h-[34rem] w-[34rem]" />
        <Container className="relative py-12 sm:py-16">
          <Reveal className="max-w-3xl">
            <Badge tone="outline">About Swapngo</Badge>
            <h1 className="mt-5 text-balance text-section-mobile font-semibold text-foreground sm:text-[2.6rem] sm:leading-[1.08]">
              Electric mobility, and the technology to run it.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Swapngo started with a simple idea: riders should not wait around to charge. We rent electric
              scooters built around swappable batteries, and we wrote the software to run that operation
              properly. Today we offer both: the rental service, and the software.
            </p>
          </Reveal>
        </Container>
      </section>

      {/* No top padding: the intro above already supplies the space (stacking both made a 128px gap). */}
      <section className="pb-12 sm:pb-16">
        <Container className="grid gap-6 lg:grid-cols-2">
          <Reveal className="flex flex-col rounded-[2rem] border border-border bg-card p-7 sm:p-9">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-sage">
              <Bike className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-foreground">EV Scooter Rental</h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              We rent electric scooters to individual riders and delivery partners in {SERVICE_CITY}. Our
              fleet runs on Motovolt MVS7 scooters, with battery swapping through Indofast Energy's network.
              Every rider is identity-verified before their first ride, and plans are priced transparently.
            </p>
            <Link to="/ev-scooter-rental" className="mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-semibold text-primary hover:text-primary-hover">
              Explore scooter rentals
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Reveal>

          <Reveal delay={100} className="flex flex-col rounded-[2rem] border border-border bg-card p-7 sm:p-9">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-dark">
              <LayoutDashboard className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-foreground">Fleet Management Software</h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Running the rental business meant building an admin console, a rider app and the systems for KYC,
              payments, GST and support behind them. We now offer that same platform, SwapNgo Fleet, to other
              companies that want to manage their own vehicle fleets.
            </p>
            <Link to="/fleet-management" className="mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-semibold text-primary hover:text-primary-hover">
              Explore SwapNgo Fleet
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Reveal>
        </Container>
      </section>

      <section className="border-y border-border bg-mist/40 py-12 sm:py-16">
        <Container className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h2 className="text-balance text-section-mobile font-semibold text-foreground sm:text-section">
              How we work
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Because we run our own fleet, we only build and sell what an operation actually needs.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <ul className="space-y-5">
              {[
                ["Verified riders", "KYC is completed and verified before a vehicle is handed over."],
                ["Transparent money", "Every charge is shown before it is paid, with GST invoices and approval-gated refunds."],
                ["Accountable operations", "Staff access is granted module by module, and sensitive actions are logged."],
                ["No overselling", "We describe what the product does today, and tell you plainly when it does not do something."],
              ].map(([title, text]) => (
                <li key={title} className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-base font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <Reveal>
            <h2 className="text-balance text-section-mobile font-semibold text-foreground sm:text-section">Find us</h2>
            <p className="mt-4 flex items-start gap-2 text-lg leading-relaxed text-muted-foreground">
              <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
              {CONTACT_ADDRESS}
            </p>
          </Reveal>
          <Reveal delay={100} className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <ButtonLink to="/contact" size="lg" className="w-full sm:w-auto">
              Contact Us
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
