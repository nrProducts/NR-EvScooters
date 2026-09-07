import { Mail, Phone, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ContactForm } from "@/components/ContactForm";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_HREF, CONTACT_IS_PLACEHOLDER, CONTACT_ADDRESS } from "@/content/contact";

export function Contact() {
  return (
    <section id="contact" className="py-12 sm:py-16">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
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

          <div className="mt-9 space-y-4">
            <ContactRow icon={Mail} label="Email" value={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
            <ContactRow icon={Phone} label="Phone" value={CONTACT_PHONE_DISPLAY} href={CONTACT_PHONE_HREF} />
            <ContactRow
              icon={MapPin}
              label="Office"
              value={CONTACT_ADDRESS}
              href={`https://maps.google.com/?q=${encodeURIComponent(CONTACT_ADDRESS)}`}
            />
          </div>
        </div>

        <ContactForm />
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
    <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4 transition-colors duration-200 hover:border-primary/40">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
  if (!href) return content;
  const external = href.startsWith("http");
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {content}
    </a>
  );
}
