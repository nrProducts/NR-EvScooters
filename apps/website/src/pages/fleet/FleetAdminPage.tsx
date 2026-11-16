import { ArrowRight, Check, KeyRound } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Link } from "@/lib/router";
import { ADMIN_GROUPS } from "@/content/fleetShots";
import { cn } from "@/lib/utils";
import { ProductShot } from "@/components/fleet/ProductShot";
import { DemoButton, FleetFinalCta, FleetPageHero } from "@/components/fleet/FleetBlocks";

/** Grouped exactly as the admin console's own sidebar groups them. */
const MODULE_GROUPS = [
  {
    title: "Fleet Operations",
    items: [
      "Dashboard",
      "Rental Operations (bookings, active rentals, returns)",
      "Vehicles, with Bike KMs",
      "Live Map",
      "Battery Stations",
      "Maintenance",
    ],
  },
  { title: "People", items: ["Users (riders)", "KYC Queue"] },
  {
    title: "Finance",
    items: [
      "Revenue",
      "Payments",
      "Refunds and Deposits",
      "Billing & Charges",
      "Plans",
      "Reconciliation",
      "Tax Invoices",
      "Purchases & ITC",
      "GST Returns",
      "Books",
    ],
  },
  { title: "Support & Comms", items: ["Support Tickets", "Notifications and broadcasts"] },
  { title: "HR Management", items: ["Attendance", "Leave", "Holidays"] },
  { title: "Compliance", items: ["Privacy Requests", "PII Access Log", "Audit Log", "Error Logs"] },
  { title: "Settings", items: ["Staff access and permission matrix", "Notification manager"] },
];

export function FleetAdminPage() {
  return (
    <>
      <FleetPageHero
        eyebrow="Admin web application"
        title="Fleet management software with an admin dashboard your whole team can use"
        description="One web console for operations, finance and compliance. Each person sees only the modules and actions you grant them."
      >
        <DemoButton placement="fleet_admin_hero" />
      </FleetPageHero>

      {/* A guided tour of the console, grouped by what you are doing. The first
          group has no top padding: the hero above already supplies the space. */}
      {ADMIN_GROUPS.map((group, gi) => {
        const last = gi === ADMIN_GROUPS.length - 1;
        return (
          <section
            key={group.id}
            id={group.id}
            className={cn(
              gi === 0 ? "pb-12 sm:pb-16" : "py-12 sm:py-16",
              gi % 2 === 1 && !last && "border-y border-border bg-mist/40",
              last && "border-t border-border",
            )}
          >
            <Container>
              <Reveal>
                <SectionHeading eyebrow={group.eyebrow} title={group.title} description={group.description} />
              </Reveal>
              <div className="mt-10 grid items-start gap-8 md:grid-cols-2">
                {group.shots.map((shot, i) => (
                  <Reveal
                    key={shot.src}
                    delay={(i % 2) * 90}
                    className={cn(group.shots.length % 2 === 1 && i === group.shots.length - 1 && "md:col-span-2")}
                  >
                    <ProductShot shot={shot} device="browser" priority={gi === 0 && i === 0} />
                  </Reveal>
                ))}
              </div>
              {last && (
                <p className="mt-8 text-center text-xs text-muted-foreground">
                  Screenshots of the live product, shown with demonstration data.
                </p>
              )}
            </Container>
          </section>
        );
      })}

      <section className="border-y border-border bg-mist/40 py-12 sm:py-16">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="What is inside"
              title={"Every module,\ngrouped the way you work."}
              description="This is the console's own navigation. Each entry is a working screen."
            />
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULE_GROUPS.map((group, i) => (
              <Reveal key={group.title} delay={(i % 3) * 80} className="rounded-3xl border border-border bg-card p-6">
                <h3 className="text-base font-semibold text-foreground">{group.title}</h3>
                <ul className="mt-4 space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-snug text-foreground/80">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-sage">
              <KeyRound className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <h2 className="mt-5 text-balance text-section-mobile font-semibold text-foreground sm:text-section">
              The right access for every role
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              An admin grants each staff member access to individual modules, and to individual actions inside
              them: for example, someone can view refunds without being able to approve one. These rules are
              enforced by the back end, not just hidden in the interface.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <ul className="space-y-4">
              {[
                ["Permission matrix", "Module by module, action by action."],
                ["Approval-gated money", "Refunds need approval before money moves."],
                ["Private by default", "Sensitive rider numbers stay hidden until someone with permission reveals them and gives a reason."],
                ["Audit log", "Sensitive actions are recorded so you can see who did what."],
              ].map(([t, d]) => (
                <li key={t} className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-base font-semibold text-foreground">{t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{d}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      <section className="border-t border-border py-10">
        <Container className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <p className="text-base font-medium text-foreground">Your riders use the companion mobile app.</p>
          <Link to="/fleet-management/rider-app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover">
            See the rider app
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Container>
      </section>

      <FleetFinalCta />
    </>
  );
}
