import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { ADMIN_CONSOLE_URL } from "@/content/links";
import { CONTACT_EMAIL, SOCIAL_LINKS } from "@/content/contact";

const QUICK_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Vehicles", href: "#vehicles" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
];

const SUPPORT_LINKS = [
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
  { label: "Admin / Staff Login", href: ADMIN_CONSOLE_URL },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <Container className="grid grid-cols-2 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Smart, affordable EV scooter rentals with battery-swap charging — no waiting to charge, ever.
          </p>
          {SOCIAL_LINKS.length > 0 && (
            <div className="mt-5 flex gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a key={s.url} href={s.url} className="text-sm font-medium text-muted-foreground hover:text-primary">
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Quick Links</h3>
          <ul className="mt-4 space-y-3">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-sm text-muted-foreground hover:text-primary">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Support</h3>
          <ul className="mt-4 space-y-3">
            {SUPPORT_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-sm text-muted-foreground hover:text-primary">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Get in Touch</h3>
          <ul className="mt-4 space-y-3">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-muted-foreground hover:text-primary">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li className="text-sm text-muted-foreground">Chennai, India</li>
          </ul>
        </div>
      </Container>

      <div className="bg-foreground">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/60 sm:flex-row">
          <p>© {year} Swapngo. All rights reserved.</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-white">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-white">
              Terms &amp; Conditions
            </a>
          </div>
        </Container>
      </div>
    </footer>
  );
}
