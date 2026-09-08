import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { CONTACT_EMAIL, CONTACT_PHONES, CONTACT_ADDRESS, SOCIAL_LINKS } from "@/content/contact";

const COMPANY_LINKS = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

// Left as "#" deliberately: /privacy.html and /terms.html are generated from
// docs/legal/*.md, which still has unresolved [PLACEHOLDER] markers awaiting
// legal review, and the generated files are gitignored until that's done —
// so they aren't live on the deployed site yet. Point these at "/privacy.html"
// and "/terms.html" once that review lands and the files are committed.
const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms & Conditions", href: "#" },
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
                  className="text-sm font-semibold text-white/60 transition-colors hover:text-primary"
                >
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Company</h3>
          <ul className="mt-5 space-y-3.5">
            {COMPANY_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-[15px] font-medium text-white/70 transition-colors hover:text-primary">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Get in Touch</h3>
          <ul className="mt-5 space-y-3.5">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[15px] font-medium text-white/70 transition-colors hover:text-primary">
                {CONTACT_EMAIL}
              </a>
            </li>
            {CONTACT_PHONES.map((p) => (
              <li key={p.href}>
                <a href={p.href} className="text-[15px] font-medium text-white/70 transition-colors hover:text-primary">
                  {p.display}
                </a>
              </li>
            ))}
            <li className="text-[15px] leading-relaxed text-white/50">{CONTACT_ADDRESS}</li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 text-sm text-white/40 sm:flex-row">
          <p>© {year} Swapngo. All rights reserved.</p>
          <div className="flex gap-6">
            {LEGAL_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </a>
            ))}
          </div>
        </Container>
      </div>
    </footer>
  );
}
