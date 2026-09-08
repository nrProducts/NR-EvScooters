import { useEffect, useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { TopBar } from "@/components/TopBar";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", href: "#home" },
  { label: "How It Works", href: "#how-it-works" },
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

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Its own solid green, independent of the nav row's scroll-driven
          background below — this bar never goes translucent or disappears. */}
      <TopBar />

      <div
        className={cn(
          "w-full transition-all duration-300",
          scrolled
            ? "border-b border-border bg-background/80 shadow-soft backdrop-blur-xl"
            : "border-b border-transparent bg-background/40 backdrop-blur-md",
        )}
      >
        <Container className="flex h-[4.5rem] items-center justify-between py-3">
          <a href="#home" aria-label="Swapngo home" className="shrink-0">
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
                    "text-[15px] font-semibold transition-colors",
                    active ? "text-primary" : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Button href="#get-app" size="sm">
              Book Now
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary/60 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </Container>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-[4.5rem] bottom-0 z-40 overflow-y-auto border-t border-border bg-background lg:hidden">
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
                      "border-b border-border py-4 text-xl font-bold",
                      active ? "text-primary" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            <div className="mt-auto pt-8">
              <Button href="#get-app" size="lg" className="w-full" onClick={() => setOpen(false)}>
                Book Now
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
