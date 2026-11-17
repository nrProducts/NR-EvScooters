import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Seo } from "@/seo/Seo";

const NOT_FOUND_META = {
  title: "Page not found | Swapngo",
  description: "This page could not be found. Explore Swapngo's EV scooter rentals or SwapNgo Fleet management software.",
  path: "/404",
  section: "home" as const,
};

export function NotFoundPage() {
  return (
    <section className="py-20 sm:py-28">
      <Seo path="/" noindex override={NOT_FOUND_META} />
      <Container className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">404</p>
        <h1 className="mt-3 text-balance text-section-mobile font-semibold text-foreground sm:text-section">
          We couldn&rsquo;t find that page.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
          The link may be old or mistyped. Here is where most people are headed:
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <ButtonLink to="/ev-scooter-rental" size="lg">
            EV Scooter Rental
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
          <ButtonLink to="/fleet-management" variant="dark" size="lg">
            Fleet Management Software
          </ButtonLink>
          <ButtonLink to="/" variant="outline" size="lg">
            Home
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
