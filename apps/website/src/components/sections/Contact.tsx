import { Mail, Phone, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ContactForm } from "@/components/ContactForm";
import { Reveal } from "@/components/ui/Reveal";
import { CONTACT_EMAIL, CONTACT_PHONES, CONTACT_IS_PLACEHOLDER, CONTACT_ADDRESS } from "@/content/contact";

export function Contact() {
  return (
    <section id="contact" className="bg-sage/40 py-12 sm:py-16">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <Reveal>
          <SectionHeading align="left" eyebrow="Contact" title="We're here to help" />
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-muted-foreground">
            Send us a query and our team will get back to you, or reach us directly using the
            details below.
          </p>

          {CONTACT_IS_PLACEHOLDER && (
            <p className="mt-4 max-w-sm text-xs text-muted-foreground">
              Contact details below are placeholders pending confirmation from the Swapngo team.
            </p>
          )}

          <div className="mt-9 space-y-5">
            <ContactRow icon={Mail} label="Email" value={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
            {/* One row per number: a single joined row can only link to one
                of them, so tapping the second would dial the first. */}
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
          <ContactForm />
        </Reveal>
      </Container>
    </section>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-start gap-3.5 rounded-[1.25rem] border border-border bg-card p-3.5 hover:border-primary/40">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] bg-sage">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{value}</p>
      </div>
    </div>
  );
  if (!href) return content;
  const external = href.startsWith("http");
  return (
    <a href={href} className="block" {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {content}
    </a>
  );
}
