import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Blob } from "@/components/ui/Blob";
import { Reveal } from "@/components/ui/Reveal";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/lib/router";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  PRICING_MODELS,
  WHAT_BOTH_INCLUDE,
  type FeatureCategory,
  type PricingModel,
} from "@/content/fleet";

/** Hero for the fleet sub-pages (the landing page has its own, larger one). */
export function FleetPageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />
      <Blob tone="sage" className="-right-40 -top-40 h-[34rem] w-[34rem]" />
      <Container className="relative py-12 sm:py-16">
        <Reveal className="max-w-3xl">
          <Badge tone="outline">{eyebrow}</Badge>
          <h1 className="mt-5 text-balance text-section-mobile font-semibold text-foreground sm:text-[2.6rem] sm:leading-[1.08]">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p>
          {children && <div className="mt-8 flex flex-col gap-3 sm:flex-row">{children}</div>}
        </Reveal>
      </Container>
    </section>
  );
}

export function DemoButton({
  placement,
  variant = "default",
  size = "lg",
  label = "Request a Demo",
  plan,
  className,
}: {
  placement: string;
  variant?: "default" | "light" | "dark" | "outline" | "outline-dark";
  size?: "lg" | "default" | "sm";
  label?: string;
  plan?: "monthly" | "one-time";
  className?: string;
}) {
  return (
    <ButtonLink
      to={`/fleet-management/request-demo${plan ? `?plan=${plan}` : ""}`}
      variant={variant}
      size={size}
      className={cn("w-full sm:w-auto", className)}
      onClick={() => trackEvent("click_request_demo", { placement })}
    >
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </ButtonLink>
  );
}

/** Closing call to action used at the foot of every fleet page. */
export function FleetFinalCta({
  heading = "See SwapNgo Fleet running on your use case",
  priceContact = false,
}: {
  heading?: string;
  /** On the pricing page the second button is "Contact for Price Details" instead of "View Pricing". */
  priceContact?: boolean;
}) {
  return (
    <section className="relative overflow-hidden bg-dark py-14 sm:py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-[0.06]" />
      <Blob tone="primary" className="left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 opacity-40" />
      <Container className="relative text-center">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-balance text-section-mobile font-semibold text-white sm:text-section">
            {heading}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/70">
            A short walkthrough of the admin console and rider app. Contact us for price details on the monthly
            subscription or the one-time purchase, whichever suits your business.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <DemoButton placement="fleet_final_cta" />
            {priceContact ? (
              <ButtonLink
                to="/contact?topic=fleet"
                variant="outline-dark"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => trackEvent("click_contact_for_price", { placement: "fleet_final_cta" })}
              >
                Contact for Price Details
              </ButtonLink>
            ) : (
              <ButtonLink
                to="/fleet-management/pricing"
                variant="outline-dark"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => trackEvent("click_view_pricing", { placement: "fleet_final_cta" })}
              >
                View Pricing
              </ButtonLink>
            )}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

export function FeatureCard({ category, index = 0 }: { category: FeatureCategory; index?: number }) {
  const Icon = category.icon;
  return (
    <Reveal
      delay={(index % 3) * 80}
      className="rounded-3xl border border-border bg-card p-7 hover:border-primary/30 hover:shadow-card"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-sage">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-foreground">{category.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{category.summary}</p>
      <ul className="mt-5 space-y-2.5">
        {category.items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-snug text-foreground/80">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/** The two purchase options side by side. `compact` is the landing-page teaser. */
export function PricingModelCards({ compact = false, placement }: { compact?: boolean; placement: string }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
      {PRICING_MODELS.map((model, i) => (
        <PricingModelCard key={model.id} model={model} compact={compact} placement={placement} index={i} />
      ))}
    </div>
  );
}

function PricingModelCard({
  model,
  compact,
  placement,
  index,
}: {
  model: PricingModel;
  compact: boolean;
  placement: string;
  index: number;
}) {
  const primary = model.id === "monthly";
  return (
    <Reveal
      delay={index * 100}
      className={cn(
        "flex flex-col rounded-[2rem] border bg-card p-7 sm:p-9",
        primary ? "border-primary/40 shadow-glow" : "border-border shadow-soft",
      )}
    >
      <Badge tone={primary ? "soft" : "outline"} className="w-fit">
        {primary ? "Pay as you go" : "Pay once"}
      </Badge>
      <h3 className="mt-4 text-2xl font-semibold text-foreground">{model.name}</h3>
      <p className="mt-2 text-base leading-relaxed text-muted-foreground">{model.tagline}</p>

      <div className="mt-6 rounded-2xl bg-sage/60 px-4 py-3 text-sm leading-relaxed text-foreground/80">
        <span className="font-semibold text-foreground">Price: </span>
        shared on request, based on your fleet.{" "}
        <Link
          to="/contact?topic=fleet"
          className="font-semibold text-primary underline-offset-2 hover:underline"
          onClick={() => trackEvent("click_contact_for_price", { placement: `${placement}_${model.id}` })}
        >
          Contact us for price details
        </Link>
      </div>

      {!compact && (
        <ul className="mt-6 space-y-3">
          {model.points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[15px] leading-snug text-foreground/85">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Best for: </span>
        {model.suits}
      </p>

      <div className="mt-auto pt-8">
        <ButtonLink
          to={`/fleet-management/request-demo?plan=${model.id}`}
          variant={primary ? "default" : "dark"}
          size="lg"
          className="w-full"
          onClick={() => trackEvent(model.ctaEvent, { placement })}
        >
          {model.cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </ButtonLink>
      </div>
    </Reveal>
  );
}

export function WhatBothInclude() {
  return (
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-border bg-sage/50 p-7 sm:p-9">
      <h3 className="text-lg font-semibold text-foreground">Included whichever way you buy</h3>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {WHAT_BOTH_INCLUDE.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[15px] leading-snug text-foreground/85">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
