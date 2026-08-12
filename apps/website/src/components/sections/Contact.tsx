import { Mail, Phone, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_HREF, CONTACT_IS_PLACEHOLDER, SERVICE_CITY } from "@/content/contact";

export function Contact() {
  return (
    <section id="contact" className="py-20 sm:py-28">
      <Container className="max-w-3xl">
        <SectionHeading eyebrow="Contact" title="We're here to help" />

        {CONTACT_IS_PLACEHOLDER && (
          <p className="mx-auto mt-4 max-w-md text-center text-xs text-muted-foreground">
            Contact details below are placeholders pending confirmation from the SwapNgo team.
          </p>
        )}

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <ContactCard icon={Mail} label="Email" value={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
          <ContactCard icon={Phone} label="Phone" value={CONTACT_PHONE_DISPLAY} href={CONTACT_PHONE_HREF} />
          <ContactCard icon={MapPin} label="Location" value={SERVICE_CITY} />
        </div>
      </Container>
    </section>
  );
}

function ContactCard({
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
    <div className="flex h-full flex-col items-center rounded-2xl border border-border bg-card p-6 text-center transition-colors duration-200 hover:border-primary/40">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}
