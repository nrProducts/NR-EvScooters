import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { FEATURE_CATEGORIES } from "@/content/fleet";
import { DemoButton, FeatureCard, FleetFinalCta, FleetPageHero } from "@/components/fleet/FleetBlocks";
import { trackEvent } from "@/lib/analytics";

export function FleetFeaturesPage() {
  return (
    <>
      <FleetPageHero
        eyebrow="Features"
        title="Fleet management system features, all in one platform"
        description={`${FEATURE_CATEGORIES.length} feature areas covering vehicles and tracking, riders, bookings, billing, GST accounting, maintenance and staff access. Everything on this page is live in the product today.`}
      >
        <DemoButton placement="fleet_features_hero" />
        <ButtonLink
          to="/fleet-management/pricing"
          variant="light"
          size="lg"
          className="w-full border border-border sm:w-auto"
          onClick={() => trackEvent("click_view_pricing", { placement: "fleet_features_hero" })}
        >
          View Pricing
        </ButtonLink>
      </FleetPageHero>

      <section className="pb-12 sm:pb-16">
        <Container>
          <nav aria-label="Feature categories" className="-mt-2 mb-10 flex flex-wrap gap-2">
            {FEATURE_CATEGORIES.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-foreground/75 hover:border-primary/40 hover:text-foreground"
              >
                {c.title}
              </a>
            ))}
          </nav>
          <div className="grid gap-5 lg:grid-cols-2">
            {FEATURE_CATEGORIES.map((category, i) => (
              <div key={category.id} id={category.id} className="scroll-mt-4">
                <FeatureCard category={category} index={i} />
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-border bg-sage/50 py-12 sm:py-16">
        <Container>
          <Reveal>
            <SectionHeading
              title={"Need something specific?"}
              description="Tell us how you run your fleet. In the demo we will show you what the product covers for your workflow, and say plainly if something is not covered."
            />
          </Reveal>
        </Container>
      </section>

      <FleetFinalCta />
    </>
  );
}
