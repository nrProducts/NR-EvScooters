import { useState } from "react";
import { Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { FAQ_ITEMS } from "@/content/faq";
import { cn } from "@/lib/utils";

const FAQ_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
});

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-12 sm:py-16">
      {/* Mirrors FAQ_ITEMS exactly, so it can never advertise an answer the page doesn't show. */}
      <script type="application/ld+json">{FAQ_JSON_LD}</script>
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Badge>FAQ</Badge>
          <h2 className="mt-4 text-balance text-section-mobile font-extrabold tracking-tight text-foreground sm:text-section">
            Questions? We've got answers.
          </h2>
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-muted-foreground">
            Everything you need to know before renting your first Swapngo scooter — booking, KYC,
            payments, and battery swapping.
          </p>
        </div>

        <div className="divide-y divide-border rounded-3xl border border-border bg-card">
          {FAQ_ITEMS.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.question}>
                <h3>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-6 py-6 text-left"
                    aria-expanded={open}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => setOpenIndex(open ? null : i)}
                  >
                    <span className="text-lg font-bold text-foreground">{item.question}</span>
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-transform duration-300",
                        open && "rotate-45 bg-primary text-primary-foreground",
                      )}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-panel-${i}`}
                  className={cn(
                    "grid overflow-hidden transition-all duration-300 ease-in-out",
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="min-h-0">
                    <p className="px-6 pb-6 text-[15px] leading-relaxed text-muted-foreground">{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
