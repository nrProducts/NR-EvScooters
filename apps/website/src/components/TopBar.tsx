import { Mail, Phone, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { WhatsAppIcon, InstagramIcon } from "@/components/ui/BrandIcons";
import { CONTACT_EMAIL, CONTACT_ADDRESS, CONTACT_PHONES, WHATSAPP_URL, INSTAGRAM_URL } from "@/content/contact";

/**
 * The thin utility strip above the main nav — email/phone/address on the
 * left, socials on the right. Rendered from inside <Header>, stacked above
 * the nav row within the SAME sticky container, so it stays visible while
 * scrolling instead of scrolling away on its own.
 */
export function TopBar() {
  return (
    <div className="hidden bg-primary text-white lg:block">
      <Container className="flex h-10 items-center justify-between text-[13px]">
        <div className="flex items-center gap-6">
          <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-2 transition-colors hover:text-dark">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {CONTACT_EMAIL}
          </a>
          <span className="flex items-center gap-4">
            {CONTACT_PHONES.map((p) => (
              <a key={p.href} href={p.href} className="flex items-center gap-2 transition-colors hover:text-dark">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {p.display}
              </a>
            ))}
          </span>
          <span className="flex items-center gap-2 text-white/85">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {CONTACT_ADDRESS}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Swapngo on WhatsApp"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15 transition-colors hover:bg-white hover:text-primary"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Swapngo on Instagram"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15 transition-colors hover:bg-white hover:text-primary"
          >
            <InstagramIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </Container>
    </div>
  );
}
