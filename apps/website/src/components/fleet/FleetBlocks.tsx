import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Link } from "@/lib/router";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  PRICING_MODELS,
  type PricingModel,
} from "@/content/fleet";

export function DemoButton({
  placement,
  variant = "default",
  size = "lg",
  label = "Request a Demo",
  className,
}: {
  placement: string;
  variant?: "default" | "light" | "dark" | "outline" | "outline-dark";
  size?: "lg" | "default" | "sm";
  label?: string;
  className?: string;
}) {
  return (
    <ButtonLink
      to="/fleet-management#demo"
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

/** The purchase option. `compact` is the landing-page teaser. */
export function PricingModelCards({ compact = false, placement }: { compact?: boolean; placement: string }) {
  return (
    <div className="mx-auto grid max-w-xl gap-6">
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
          to="/fleet-management#demo"
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
