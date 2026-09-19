import { useEffect, useState } from "react";
import { Menu, X, ArrowRight, Phone, Mail } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { TopBar } from "@/components/TopBar";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { CONTACT_EMAIL, CONTACT_PHONES } from "@/content/contact";

const NAV_ITEMS = [
  { label: "Home", href: "#home" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState("#home");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlights whichever section's id currently sits just below the sticky
  // header, rather than reacting to click — the site is one page with anchor
  // links, so "active" only ever means "what's in view right now".
  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.href.slice(1))).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveHref(`#${entry.target.id}`);
        }
      },
      // A thin band just under the sticky header — a section only "counts"
      // once it's actually the thing occupying that band, not the moment it
      // first peeks into the bottom of the viewport.
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /**
   * While the menu is open: lock background scroll, close on Escape, and
   * push a history entry so the phone's back gesture dismisses the menu
   * instead of leaving the site — the behaviour people expect from a
   * full-screen drawer. The popstate listener only ever closes, and the
   * cleanup pops our own entry back off if the menu was closed some other
   * way (link tap, outside tap, Escape).
   */
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPopState = () => setOpen(false);

    window.history.pushState({ swapngoMenu: true }, "");
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
      if (window.history.state?.swapngoMenu) window.history.back();
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Its own solid green, independent of the nav row's scroll-driven
          background below — this bar never goes translucent or disappears. */}
      <TopBar />

      {/* A floating pill rather than a full-bleed bar — inset 16px each side so
          it reads as an object resting on the page, not a chrome edge. */}
      <div className="px-4 pt-3">
        <div
          className={cn(
            "mx-auto flex h-16 max-w-6xl items-center justify-between rounded-full border pl-5 pr-3 backdrop-blur-[20px]",
            scrolled ? "border-border bg-white/70 shadow-soft" : "border-transparent bg-white/50",
          )}
        >
          <a href="#home" aria-label="Swapngo home" className="flex min-h-[44px] shrink-0 items-center">
            <Logo />
          </a>

          <nav
            className="hidden items-center gap-9 rounded-full lg:flex"
            aria-label="Primary"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeHref === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-sm font-medium",
                    active ? "text-primary" : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Button
              href="#get-app"
              variant="dark"
              size="sm"
              onClick={() => trackEvent("click_book_now", { placement: "header" })}
            >
              Book now
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary/60 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-x-0 top-[5.25rem] bottom-0 z-40 overflow-y-auto bg-background/95 backdrop-blur-xl lg:hidden"
          onClick={(e) => {
            // Tapping the panel's own padding (i.e. outside the links) closes it.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <Container className="flex h-full flex-col py-6">
            <nav className="flex flex-col" aria-label="Primary mobile">
              {NAV_ITEMS.map((item) => {
                const active = activeHref === item.href;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "border-b border-border py-4 text-xl font-medium",
                      active ? "text-primary" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            {/* Phone and email live in the desktop top bar, which is hidden on
                phones — so they are surfaced here instead, where a rider who
                wants to talk to someone can reach them in one tap. */}
            <div className="mt-8 space-y-2">
              {CONTACT_PHONES.map((p) => (
                <a
                  key={p.href}
                  href={p.href}
                  onClick={() => trackEvent("click_phone", { placement: "mobile_menu" })}
                  className="flex min-h-[48px] items-center gap-3 rounded-2xl bg-sage/60 px-4 text-[15px] font-medium text-foreground"
                >
                  <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {p.display}
                </a>
              ))}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                onClick={() => trackEvent("click_email", { placement: "mobile_menu" })}
                className="flex min-h-[48px] items-center gap-3 rounded-2xl bg-sage/60 px-4 text-[15px] font-medium text-foreground"
              >
                <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{CONTACT_EMAIL}</span>
              </a>
            </div>

            <div className="mt-auto pt-8">
              <Button
                href="#get-app"
                size="lg"
                className="w-full"
                onClick={() => {
                  trackEvent("click_book_now", { placement: "mobile_menu" });
                  setOpen(false);
                }}
              >
                Book now
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
