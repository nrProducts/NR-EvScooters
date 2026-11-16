import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { CONTACT_EMAIL, CONTACT_PHONES, CONTACT_ADDRESS, SOCIAL_LINKS } from "@/content/contact";
import { trackEvent } from "@/lib/analytics";
import { Link } from "@/lib/router";

const RENTAL_LINKS = [
  { label: "EV Scooter Rental", to: "/ev-scooter-rental" },
  { label: "How it works", to: "/ev-scooter-rental#how-it-works" },
  { label: "Rental plans", to: "/ev-scooter-rental#pricing" },
  { label: "Battery swapping", to: "/ev-scooter-rental#battery-swap" },
  { label: "Rental FAQ", to: "/ev-scooter-rental#faq" },
];

const FLEET_LINKS = [
  { label: "Fleet Management Software", to: "/fleet-management" },
  { label: "Features", to: "/fleet-management/features" },
  { label: "Admin app", to: "/fleet-management/admin-app" },
  { label: "Rider app", to: "/fleet-management/rider-app" },
  { label: "Pricing", to: "/fleet-management/pricing" },
  { label: "Request a demo", to: "/fleet-management/request-demo" },
];

const COMPANY_LINKS = [
  { label: "Home", to: "/" },
  { label: "About Us", to: "/about" },
  { label: "Contact Us", to: "/contact" },
];

const linkClass =
  "-mx-2 inline-flex min-h-[40px] items-center px-2 text-[15px] font-medium text-white/70 hover:text-primary";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-near-black text-white">
      <Container className="grid gap-12 py-16 sm:grid-cols-2 sm:py-20 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr] lg:gap-8">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo className="brightness-0 invert" />
          <p className="mt-5 max-w-xs text-base leading-relaxed text-white/60">Move smarter. Ride electric.</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/40">
            EV scooter rentals with battery-swap charging, and the fleet management software behind them.
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

        <FooterColumn title="EV Scooter Rental" links={RENTAL_LINKS} />
        <FooterColumn title="Fleet Software" links={FLEET_LINKS} />
        <FooterColumn title="Company" links={COMPANY_LINKS} />

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">Get in Touch</h3>
          <ul className="mt-4 space-y-1">
            <li>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                onClick={() => trackEvent("click_email", { placement: "footer" })}
                className={linkClass}
              >
                {CONTACT_EMAIL}
              </a>
            </li>
            {CONTACT_PHONES.map((p) => (
              <li key={p.href}>
                <a
                  href={p.href}
                  onClick={() => trackEvent("click_phone", { placement: "footer" })}
                  className={linkClass}
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
        <Container className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-white/40 sm:flex-row sm:gap-6">
          <p>© {year} Swapngo. All rights reserved.</p>
          <a href="/terms.html" className="hover:text-primary">Terms &amp; Conditions</a>
          <a href="/privacy.html" className="hover:text-primary">Privacy Policy</a>
        </Container>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; to: string }[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">{title}</h3>
      <ul className="mt-4 space-y-1">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className={linkClass}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
