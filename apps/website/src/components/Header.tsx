import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { ADMIN_CONSOLE_URL } from "@/content/links";
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-colors duration-200",
        scrolled ? "border-border bg-background/90 backdrop-blur" : "border-transparent bg-background/60 backdrop-blur",
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <a href="#home" aria-label="Swapngo home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button href={ADMIN_CONSOLE_URL} variant="ghost" size="sm">
            Login
          </Button>
          <Button href="#get-app" size="sm">
            Book Now
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </Container>

      {open && (
        <div className="border-t border-border bg-background lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-base font-medium text-foreground hover:bg-secondary"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
              <Button href={ADMIN_CONSOLE_URL} variant="outline" onClick={() => setOpen(false)}>
                Login
              </Button>
              <Button href="#get-app" onClick={() => setOpen(false)}>
                Book Now
              </Button>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
