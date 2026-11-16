import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "@/lib/router";
import { findPage } from "@/seo/Seo";
import { FLEET_MENU, RENTAL_MENU } from "@/components/navMenus";

/**
 * The secondary menu: a slim rail floating on the left edge, centred on the
 * screen's height, inside the rental and fleet pages only. Icons at rest; point
 * at it (or tab into it) and it opens over the page to show names. Page
 * content is untouched, still full width and centred.
 *
 * Only from 1400px up: the page's text column starts about 92px from the edge
 * there, which is just enough room for the 48px rail. Narrower laptops keep the
 * dropdowns in the header instead (Header.tsx hides those from 1400px up), and
 * phones use the menu drawer.
 */
export function SectionRail() {
  const { pathname, hash } = useLocation();
  const section = findPage(pathname)?.section;
  const items = section === "rental" ? RENTAL_MENU : section === "fleet" ? FLEET_MENU : null;
  const [activeAnchor, setActiveAnchor] = useState("");

  // The rental page is one long page, so "current" means "the section in view".
  useEffect(() => {
    if (section !== "rental") {
      setActiveAnchor("");
      return;
    }
    const ids = RENTAL_MENU.map((item) => item.to.split("#")[1]);
    let cleanup = () => {};
    // Wait a tick: the page's sections mount after this effect on navigation.
    const timer = window.setTimeout(() => {
      const sections = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      if (sections.length === 0) return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActiveAnchor(`#${entry.target.id}`);
          }
        },
        { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
      );
      sections.forEach((el) => observer.observe(el));
      cleanup = () => observer.disconnect();
    }, 100);
    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [section, pathname]);

  if (!items) return null;

  return (
    <nav
      aria-label={section === "fleet" ? "Fleet management software pages" : "EV scooter rental sections"}
      // Centred in the area below the sticky header (6.5rem tall at this width).
      style={{ top: "calc(50% + 3.25rem)" }}
      className="group/rail fixed left-3 z-40 hidden -translate-y-1/2 min-[1400px]:block"
    >
      <ul className="w-12 overflow-hidden rounded-[1.75rem] border border-border bg-white/95 p-1.5 shadow-lift backdrop-blur transition-[width] duration-200 group-focus-within/rail:w-60 group-hover/rail:w-60">
        {items.map((item) => {
          const [itemPath, itemHash] = item.to.split("#");
          const active =
            section === "fleet"
              ? pathname === itemPath
              : (activeAnchor || hash) === `#${itemHash}`;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 whitespace-nowrap rounded-full pl-[0.5625rem] pr-4 text-[13px] font-medium transition-colors",
                  item.accent && !active ? "mt-1 bg-primary text-white hover:bg-primary-hover" : "",
                  active
                    ? "bg-sage text-primary"
                    : !item.accent && "text-foreground/65 hover:bg-sage/60 hover:text-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <span className="opacity-0 transition-opacity group-focus-within/rail:opacity-100 group-hover/rail:opacity-100">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
