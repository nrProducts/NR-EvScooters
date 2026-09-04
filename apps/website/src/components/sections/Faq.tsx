import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FAQ_ITEMS } from "@/content/faq";
import { cn } from "@/lib/utils";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-surface py-14 sm:py-20">
      <Container className="max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />

        <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
          {FAQ_ITEMS.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.question}>
                <h3>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                    aria-expanded={open}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => setOpenIndex(open ? null : i)}
                  >
                    <span className="text-base font-semibold text-foreground">{item.question}</span>
                    <ChevronDown
                      className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180 text-primary")}
                      aria-hidden
                    />
                  </button>
                </h3>
                {open && (
                  <div id={`faq-panel-${i}`} className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
