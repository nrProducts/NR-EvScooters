import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { CONTACT_EMAIL, CONTACT_PHONES, CONTACT_ADDRESS, SOCIAL_LINKS } from "@/content/contact";
import { trackEvent } from "@/lib/analytics";

const COMPANY_LINKS = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-near-black text-white">
      <Container className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr_1fr] lg:gap-8">
        <div>
          <Logo className="brightness-0 invert" />
          <p className="mt-5 max-w-xs text-base leading-relaxed text-white/60">
            Move smarter. Ride electric.
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/40">
            EV scooter rentals with battery-swap charging — no waiting to charge, ever.
          </p>
          {SOCIAL_LINKS.length > 0 && (
            <div className="mt-6 flex gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    trackEvent("social_link_click", {
                      platform: s.label.toLowerCase(),
                      placement: "footer",
                    })
                  }
                  className="-mx-2 inline-flex min-h-[40px] items-center px-2 text-sm font-semibold text-white/60 hover:text-primary"
                >
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">Company</h3>
          <ul className="mt-4 space-y-1">
            {COMPANY_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="-mx-2 inline-flex min-h-[40px] items-center px-2 text-[15px] font-medium text-white/70 hover:text-primary">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">Get in Touch</h3>
          <ul className="mt-4 space-y-1">
            <li>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                onClick={() => trackEvent("click_email", { placement: "footer" })}
                className="-mx-2 inline-flex min-h-[40px] items-center px-2 text-[15px] font-medium text-white/70 hover:text-primary"
              >
                {CONTACT_EMAIL}
              </a>
            </li>
            {CONTACT_PHONES.map((p) => (
              <li key={p.href}>
                <a
                  href={p.href}
                  onClick={() => trackEvent("click_phone", { placement: "footer" })}
                  className="-mx-2 inline-flex min-h-[40px] items-center px-2 text-[15px] font-medium text-white/70 hover:text-primary"
                >
                  {p.display}
                </a>
              </li>
            ))}
            <li className="pt-2 text-[15px] leading-relaxed text-white/50">{CONTACT_ADDRESS}</li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex items-center justify-center py-6 text-sm text-white/40">
          <p>© {year} Swapngo. All rights reserved.</p>
        </Container>
      </div>
    </footer>
  );
}
