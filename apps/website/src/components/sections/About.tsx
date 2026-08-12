import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SERVICE_CITY } from "@/content/contact";

export function About() {
  return (
    <section id="about" className="py-20 sm:py-28">
      <Container className="max-w-3xl">
        <SectionHeading align="left" eyebrow="About SwapNgo" title="EV rentals, without the wait" />

        <div className="mt-8 space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
            SwapNgo rents electric scooters built around swappable-battery charging: instead of plugging in and
            waiting, riders swap a depleted battery for a fully charged one in minutes at a nearby station. It's the
            same idea behind our name — swap, and go.
          </p>
          <p>
            We're currently live in <strong className="text-foreground">{SERVICE_CITY}</strong>, running our fleet
            on Motovolt's MVS7 scooters in partnership with Indofast Energy's battery-swap network — one of the
            largest in the country.
          </p>
          <p>
            Our focus is simple: affordable rentals, a booking flow that respects your time, and vehicles that are
            actually maintained. Every rider is identity-verified before their first ride, every scooter is tracked
            in our fleet system, and every plan is priced transparently — no fine print.
          </p>
        </div>
      </Container>
    </section>
  );
}
