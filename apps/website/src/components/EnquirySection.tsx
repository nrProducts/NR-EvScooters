import { useState } from "react";
import { Bike, LayoutDashboard, Handshake, Mail, Phone, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { ContactForm, CONTACT_PAGE_TOPICS } from "@/components/ContactForm";
import { ContactRow } from "@/components/sections/Contact";
import { CONTACT_EMAIL, CONTACT_PHONES, CONTACT_ADDRESS } from "@/content/contact";
import { useLocation } from "@/lib/router";
import { cn } from "@/lib/utils";

interface Topic {
  key: "rental" | "fleet" | "partnership";
  queryType: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
}

const TOPICS: Topic[] = [
  { key: "rental", queryType: "rental", icon: Bike, title: "Scooter Rentals", blurb: "Plans, availability, pickup." },
  { key: "fleet", queryType: "fleet_software", icon: LayoutDashboard, title: "Fleet Management Software", blurb: "Demos, pricing, how it works." },
  { key: "partnership", queryType: "partnership", icon: Handshake, title: "Business Partnerships", blurb: "Work with us." },
];

/**
 * The site-level enquiry block (Home and Contact Us). Three topic cards choose
 * what the enquiry is about — which sets the form's topic, and therefore which
 * inbox subject line the team sees — so a software buyer and a rider never
 * have to read each other's instructions.
 */
export function EnquirySection({ id = "contact", headingLevel = 2 }: { id?: string; headingLevel?: 1 | 2 }) {
  const { search } = useLocation();
  const fromUrl = new URLSearchParams(search).get("topic");
  const initial = TOPICS.find((t) => t.key === fromUrl)?.key ?? "rental";
  const [topic, setTopic] = useState<Topic["key"]>(initial);
  const current = TOPICS.find((t) => t.key === topic)!;

  return (
    <section id={id} className="bg-sage/40 py-12 sm:py-16">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <Reveal>
          <SectionHeading
            align="left"
            eyebrow="Contact & enquiry"
            title="How can we help?"
            headingLevel={headingLevel}
          />
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            Pick what your enquiry is about and send us a message. The right person on our team will reply.
          </p>

          <div role="radiogroup" aria-label="What is your enquiry about?" className="mt-7 grid gap-3">
            {TOPICS.map((t) => {
              const Icon = t.icon;
              const selected = t.key === topic;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTopic(t.key)}
                  className={cn(
                    "flex items-center gap-3.5 rounded-2xl border p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    selected ? "border-primary bg-white shadow-soft" : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem]", selected ? "bg-primary/10" : "bg-sage")}>
                    <Icon className="h-5 w-5 text-primary" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{t.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 space-y-3">
            <ContactRow icon={Mail} label="Email" value={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
            {CONTACT_PHONES.map((p) => (
              <ContactRow key={p.href} icon={Phone} label="Phone" value={p.display} href={p.href} />
            ))}
            <ContactRow
              icon={MapPin}
              label="Office"
              value={CONTACT_ADDRESS}
              href={`https://maps.google.com/?q=${encodeURIComponent(CONTACT_ADDRESS)}`}
            />
          </div>
        </Reveal>

        <Reveal delay={120}>
          <ContactForm
            topics={CONTACT_PAGE_TOPICS}
            defaultTopic={current.queryType}
            placement="enquiry_section"
          />
        </Reveal>
      </Container>
    </section>
  );
}
