import { Mail, Phone, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { InstagramIcon } from "@/components/ui/BrandIcons";
import { CONTACT_EMAIL, CONTACT_ADDRESS, CONTACT_PHONES, INSTAGRAM_URL, MAPS_URL } from "@/content/contact";
import { trackEvent } from "@/lib/analytics";

/**
 * The thin utility strip above the main nav — email/phone/address on the
 * left, socials on the right. Rendered from inside <Header>, stacked above
 * the nav row within the SAME sticky container, so it stays visible while
 * scrolling instead of scrolling away on its own.
 */
export function TopBar() {
  return (
    <div className="hidden bg-dark text-white/80 lg:block">
      <Container className="flex h-10 items-center justify-between text-[13px]">
        <div className="flex items-center gap-6">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            onClick={() => trackEvent("click_email", { placement: "topbar" })}
            className="flex min-h-[32px] items-center gap-2 hover:text-white"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {CONTACT_EMAIL}
          </a>
          <span className="flex items-center gap-4">
            {CONTACT_PHONES.map((p) => (
              <a
                key={p.href}
                href={p.href}
                onClick={() => trackEvent("click_phone", { placement: "topbar" })}
                className="flex min-h-[32px] items-center gap-2 hover:text-white"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {p.display}
              </a>
            ))}
          </span>
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackEvent("click_location", { placement: "topbar" })}
            className="flex min-h-[32px] items-center gap-2 text-white/85 hover:text-white"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {CONTACT_ADDRESS}
          </a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Swapngo on Instagram"
            onClick={() => trackEvent("social_link_click", { platform: "instagram", placement: "topbar" })}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 hover:bg-white hover:text-dark"
          >
            <InstagramIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </Container>
    </div>
  );
}
