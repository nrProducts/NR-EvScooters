import { useEffect, useRef, useState } from "react";
import { Menu, X, ArrowRight, ChevronRight, ChevronDown, Phone, Mail, Download } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { TopBar } from "@/components/TopBar";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { CONTACT_EMAIL, CONTACT_PHONES } from "@/content/contact";
import { PLAY_STORE_URL } from "@/content/links";
import { PRE_BOOKING_MODE } from "@/content/launchMode";
import { useBookingCta } from "@/lib/bookingCta";
import { Link, useLocation } from "@/lib/router";
import { findPage } from "@/seo/Seo";
import { RENTAL_MENU, type MenuLink } from "@/components/navMenus";

/** The five top-level destinations. Order is the spec's. */
const NAV_ITEMS: {
  key: string;
  label: string;
  to: string;
  match: (p: string) => boolean;
  menu?: MenuLink[];
}[] = [
  { key: "home", label: "Home", to: "/", match: (p) => p === "/" },
  { key: "rental", label: "EV Scooter Rental", to: "/ev-scooter-rental", match: (p) => p === "/ev-scooter-rental", menu: RENTAL_MENU },
  {
    key: "fleet",
    label: "Fleet Management Software",
    to: "/fleet-management",
    match: (p) => p === "/fleet-management" || p.startsWith("/fleet-management/"),
  },
  { key: "about", label: "About Us", to: "/about", match: (p) => p === "/about" },
  { key: "contact", label: "Contact Us", to: "/contact", match: (p) => p === "/contact" },
];

export function Header() {
  const { pathname, hash } = useLocation();
  const section = findPage(pathname)?.section ?? "home";
  const preBookCta = useBookingCta("header_desktop");
  const mobilePreBookCta = useBookingCta("header_mobile_menu");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  /** Which business's menu is showing on desktop (a NAV_ITEMS key), if any. */
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Any navigation, including a same-page anchor jump, puts the menu away.
  useEffect(() => {
    setMenuKey(null);
  }, [pathname, hash]);

  // An open menu closes on Escape or on a press anywhere outside the nav.
  useEffect(() => {
    if (!menuKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuKey(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenuKey(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuKey]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const showMenu = (key: string) => {
    window.clearTimeout(hoverTimer.current);
    setMenuKey(key);
  };
  // A short grace period so the pointer can cross the gap into the panel.
  const hideMenu = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setMenuKey(null), 140);
  };

  /**
   * Set right before closing the menu via a nav/contact link tap — those
   * already navigate for real (pushing their own history entry). The effect's
   * cleanup below must NOT call history.back() in that case: doing so
   * unconditionally used to pop straight past the link's own new entry, landing
   * back on the pre-menu URL — the link tap visibly did nothing. Escape /
   * backdrop tap / the X button never navigate, so those still need the pop to
   * keep the synthetic entry from lingering in history.
   */
  const closingViaLinkRef = useRef(false);

  /**
   * While the menu is open: lock background scroll, close on Escape, and push a
   * history entry so the phone's back gesture dismisses the menu instead of
   * leaving the site — the behaviour people expect from a full-screen drawer.
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
      if (closingViaLinkRef.current) {
        closingViaLinkRef.current = false;
      } else if (window.history.state?.swapngoMenu) {
        window.history.back();
      }
    };
  }, [open]);

  const closeMenuForLink = () => {
    closingViaLinkRef.current = true;
    setOpen(false);
  };

  // The one primary action in the header depends on which business you are in.
  const cta =
    section === "fleet"
      ? { label: "Request a Demo", to: "/fleet-management#demo", onClick: () => trackEvent("click_request_demo", { placement: "header" }) }
      : section === "rental"
        ? null
        : { label: "Get in touch", to: "/contact", onClick: () => trackEvent("click_contact", { placement: "header" }) };

  /** Rental pages: send riders straight to the Android app (or the pre-book form while that mode is on). */
  const rentalCta = (placement: "header" | "header_mobile_menu") => {
    const pre = placement === "header" ? preBookCta : mobilePreBookCta;
    if (PRE_BOOKING_MODE || !PLAY_STORE_URL) {
      return { label: PRE_BOOKING_MODE ? "Pre-Book" : "Book now", href: pre.href, onClick: pre.onClick, external: false, download: false };
    }
    return {
      label: "Download app",
      href: PLAY_STORE_URL,
      onClick: () => trackEvent("click_get_app", { platform: "android", placement }),
      external: true,
      download: true,
    };
  };

  const desktopRental = rentalCta("header");
  const mobileRental = rentalCta("header_mobile_menu");

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border bg-white",
        scrolled && "shadow-soft",
      )}
    >
      {/* Its own solid bar; the whole header is opaque so page content never
          shows through it while scrolling. */}
      <TopBar />

      <Container className="flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="Swapngo home" className="flex min-h-[44px] shrink-0 items-center">
          <Logo />
        </Link>

        {/* The five destinations. The two businesses open a small panel of their
            own pages on hover, focus or tap of the arrow; the current page keeps
            a bar on the row's bottom edge. */}
        <nav ref={navRef} className="hidden h-full items-stretch gap-6 lg:flex xl:gap-9" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const menu = item.menu;
            const expanded = menuKey === item.key;
            return (
              <div
                key={item.key}
                className="relative flex h-full items-stretch"
                onMouseEnter={menu ? () => showMenu(item.key) : undefined}
                onMouseLeave={menu ? hideMenu : undefined}
                onBlur={
                  menu
                    ? (e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMenuKey(null);
                      }
                    : undefined
                }
              >
                <div
                  className={cn(
                    "relative flex items-center gap-0.5 text-sm font-medium transition-colors",
                    "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                    active || expanded
                      ? "text-foreground"
                      : "text-foreground/60 hover:text-foreground",
                    active
                      ? "after:bg-primary"
                      : expanded
                        ? "after:bg-foreground/20"
                        : "after:bg-transparent hover:after:bg-foreground/15",
                  )}
                >
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className="inline-flex h-full items-center whitespace-nowrap"
                  >
                    {item.label}
                  </Link>
                  {menu && (
                    <button
                      type="button"
                      aria-label={`${item.label} pages`}
                      aria-haspopup="true"
                      aria-expanded={expanded}
                      aria-controls={`nav-menu-${item.key}`}
                      onClick={() => setMenuKey(expanded ? null : item.key)}
                      className="inline-flex h-6 w-5 items-center justify-center rounded-full hover:bg-sage/70"
                    >
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                  )}
                </div>

                {menu && (
                  // Always in the page (so its links are crawlable and measured), but
                  // invisible and out of the tab order until opened. The padding on
                  // top is part of the hover area, so there is no gap to fall through.
                  <div
                    id={`nav-menu-${item.key}`}
                    className={cn(
                      "absolute left-1/2 top-full z-50 w-[21.5rem] -translate-x-1/2 pt-2 transition duration-150",
                      expanded ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
                    )}
                  >
                    <div className="rounded-2xl border border-border bg-white p-2 shadow-lift">
                      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/45">
                        {item.key === "fleet" ? "SwapNgo Fleet" : "Scooter rental"}
                      </p>
                      <ul>
                        {menu.map((m) => {
                          const [mPath] = m.to.split("#");
                          const current = item.key === "fleet" && pathname === mPath;
                          return (
                            <li key={m.to}>
                              <Link
                                to={m.to}
                                onClick={() => setMenuKey(null)}
                                aria-current={current ? "page" : undefined}
                                className={cn(
                                  "group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                                  m.accent ? "mt-1 bg-sage/60 hover:bg-sage" : "hover:bg-sage/60",
                                  current && "bg-sage/60",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                                    m.accent ? "bg-primary text-white" : "bg-sage text-primary group-hover:bg-white",
                                  )}
                                >
                                  <m.icon className="h-[18px] w-[18px]" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold leading-tight text-foreground">{m.label}</span>
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{m.text}</span>
                                </span>
                                <ArrowRight
                                  className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-primary opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100"
                                  aria-hidden
                                />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          {section === "rental" ? (
            <Button
              href={desktopRental.href}
              variant="dark"
              size="sm"
              onClick={desktopRental.onClick}
              {...(desktopRental.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {desktopRental.download && <Download className="h-3.5 w-3.5" aria-hidden />}
              {desktopRental.label}
              {!desktopRental.download && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
            </Button>
          ) : (
            cta && (
              <Link
                to={cta.to}
                onClick={cta.onClick}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 text-xs font-medium text-white hover:bg-foreground/85"
              >
                {cta.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )
          )}
        </div>

        <button
          type="button"
          className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-secondary/60 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </Container>

      {open && (
        <div
          className="fixed inset-x-0 bottom-0 top-[4.0625rem] z-40 overflow-y-auto bg-background lg:hidden"
          onClick={(e) => {
            // Tapping the panel's own padding (i.e. outside the links) closes it.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <Container className="flex min-h-full flex-col py-6">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-foreground/45">Menu</span>
            <nav className="mt-3 flex flex-col gap-1.5" aria-label="Primary mobile">
              {NAV_ITEMS.map((item) => {
                const active = item.match(pathname);
                return (
                  <div key={item.key}>
                    <Link
                      to={item.to}
                      onClick={closeMenuForLink}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-4 text-lg font-semibold transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-sage/60 active:bg-sage/80",
                      )}
                    >
                      {item.label}
                      <ChevronRight
                        className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-foreground/25")}
                        aria-hidden
                      />
                    </Link>
                    {/* Inside a business, its own pages are one tap away — the
                        phone's version of the desktop panel. */}
                    {item.menu && active && (
                      <ul className="mb-1 ml-4 mt-1 space-y-0.5 border-l-2 border-primary/25 pl-3">
                        {item.menu.map((m) => (
                          <li key={m.to}>
                            <Link
                              to={m.to}
                              onClick={closeMenuForLink}
                              className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-foreground/80 hover:bg-sage/60 active:bg-sage/80"
                            >
                              <m.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                              {m.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Phone and email live in the desktop top bar, which is hidden on
                phones — so they are surfaced here instead, where a visitor who
                wants to talk to someone can reach them in one tap. */}
            <span className="mt-8 px-1 text-xs font-semibold uppercase tracking-wide text-foreground/45">
              Get in touch
            </span>
            <div className="mt-3 space-y-2">
              {CONTACT_PHONES.map((p) => (
                <a
                  key={p.href}
                  href={p.href}
                  onClick={() => trackEvent("click_phone", { placement: "mobile_menu" })}
                  className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-sage/60 px-4 text-[15px] font-medium text-foreground transition-colors hover:bg-sage active:bg-sage"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary">
                    <Phone className="h-4 w-4" aria-hidden />
                  </span>
                  {p.display}
                </a>
              ))}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                onClick={() => trackEvent("click_email", { placement: "mobile_menu" })}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-sage/60 px-4 text-[15px] font-medium text-foreground transition-colors hover:bg-sage active:bg-sage"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary">
                  <Mail className="h-4 w-4" aria-hidden />
                </span>
                <span className="truncate">{CONTACT_EMAIL}</span>
              </a>
            </div>

            <div className="mt-auto pt-8">
              {section === "rental" ? (
                <Button
                  href={mobileRental.href}
                  size="lg"
                  className="w-full"
                  onClick={(e) => {
                    mobileRental.onClick(e);
                    closeMenuForLink();
                  }}
                  {...(mobileRental.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {mobileRental.download && <Download className="h-4 w-4" aria-hidden />}
                  {PRE_BOOKING_MODE ? "Pre-Book Now" : mobileRental.label}
                  {!mobileRental.download && <ArrowRight className="h-4 w-4" aria-hidden />}
                </Button>
              ) : (
                cta && (
                  <Link
                    to={cta.to}
                    onClick={() => {
                      cta.onClick();
                      closeMenuForLink();
                    }}
                    className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-base font-medium text-primary-foreground shadow-soft hover:bg-primary-hover"
                  >
                    {cta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                )
              )}
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
