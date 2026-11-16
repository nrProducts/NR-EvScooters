import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import faq from "@/seo/fleetFaq.json";

/**
 * Same questions that go into the page's FAQPage JSON-LD (src/seo/fleetFaq.json
 * feeds both), so what a search engine reads is exactly what a visitor sees.
 */
export function FleetFaq() {
  return (
    <section id="faq" className="py-12 sm:py-16">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="FAQ" title="Questions we hear most" />
        </Reveal>
        <Reveal className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-3xl border border-border bg-card">
          {faq.map((item) => (
            <details key={item.question} className="group px-6 py-1">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown className="h-4 w-4 shrink-0 text-foreground/40 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 pr-8 text-[15px] leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
