import { useEffect, useState } from "react";
import { NavLink, useLocation, useMatch } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { buildNavTree, navForUser, type NavItem } from "@/routes/roleConfig";
import type { StaffUser } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useBrandLogos } from "@/hooks/useBrandLogos";

/**
 * Hoisted to module scope deliberately — a component defined INSIDE Sidebar's
 * body gets a new function identity every Sidebar render, which React treats
 * as a different component type, unmounting and remounting every nav link on
 * every re-render.
 */
function NavItemLink({
  item,
  collapsed,
  child,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  /** A page listed inside an open section: a little tighter than a top-level entry. */
  child?: boolean;
  onNavigate?: () => void;
}) {
  // Hook must run unconditionally; only the collapsed branch below uses it.
  const isActive = !!useMatch({ path: item.path, end: false });

  // --- Expanded sidebar: the current page is a solid green pill ---
  if (!collapsed) {
    return (
      <NavLink
        to={item.path}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-xl font-medium transition-smooth",
            child ? "gap-2.5 px-3 py-2 text-[0.8125rem]" : "px-3 py-2 text-sm",
            isActive
              ? "bg-primary font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.65)]"
              : "text-sidebar-foreground/70 hover:bg-primary/10 hover:text-primary",
          )
        }
      >
        {child ? (
          <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        ) : (
          // Same 32px icon box as the section headers (Fleet Operations, People…),
          // so Dashboard and Settings line up with them: icon over icon, label
          // over label, same row height. A bare icon sat ~7px left of theirs.
          <span className="flex h-8 w-8 shrink-0 items-center justify-center">
            <item.icon className="h-[1.0625rem] w-[1.0625rem]" strokeWidth={1.75} />
          </span>
        )}
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  }

  // --- Collapsed icon rail: inline styles so nothing in the cascade can hide
  // the icon or the active-state green. Module name moves to a hover tooltip.
  // Colours come from the theme tokens (muted / primary), NOT fixed hex values:
  // a hard-coded light grey stayed light in dark mode. ---
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.path}
          onClick={onNavigate}
          className={cn(
            "mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-smooth",
            isActive
              ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.5)]"
              : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary",
          )}
        >
          <item.icon className="h-[1rem] w-[1rem] shrink-0" strokeWidth={1.75} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The foot of the sidebar: who is signed in, with Sign out. Collapsed, it is
 * just the sign-out button.
 */
function AccountCard({ collapsed }: { collapsed?: boolean }) {
  const { user, signOut } = useAuth();

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sign out</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-muted/60 p-2">
      <Avatar className="h-9 w-9">
        <AvatarImage src={user?.avatarUrl} alt={user?.name} />
        <AvatarFallback>{user ? initials(user.name) : "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-semibold leading-tight">{user?.name}</p>
        <p className="truncate text-[0.6875rem] capitalize text-muted-foreground">{user?.role}</p>
      </div>
      <button
        type="button"
        onClick={signOut}
        aria-label="Sign out"
        title="Sign out"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function Sidebar({
  user,
  collapsed,
  split,
  onToggleCollapsed,
  onNavigate,
}: {
  user: Pick<StaffUser, "role" | "permissions">;
  collapsed?: boolean;
  /** Desktop: the logo floats on the page background and only the navigation sits in the white panel. */
  split?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const allItems = navForUser(user);
  // Settings is pinned to the foot of the sidebar, below the sections, not listed among them.
  const settings = allItems.find((item) => item.path === "/settings");
  const items = allItems.filter((item) => item.path !== "/settings");
  const tree = buildNavTree(items);
  const { icon: logoIcon, wordmark: logoWordmark } = useBrandLogos();
  const location = useLocation();
  // Longest-prefix match, mirroring NavLink's own isActive semantics.
  const activeItem = [...allItems]
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  /**
   * Which sections are expanded.
   *
   *  - The current page's section is ALWAYS open and can't be closed — it is
   *    derived from the route on every render, never stored, so clicking its
   *    header does nothing.
   *  - Every other section is a plain toggle: clicking it only opens or closes
   *    it, alongside the current one, and never navigates — the page changes
   *    only when a page inside it is picked.
   *  - Moving to a page in another section (a click, back/forward, global
   *    search) folds the hand-opened sections away, so the menu doesn't pile up.
   */
  const activeGroup = activeItem?.group;
  const [extraOpen, setExtraOpen] = useState<string[]>([]);

  useEffect(() => {
    setExtraOpen([]);
  }, [activeGroup]);

  const openGroups = activeGroup ? [activeGroup, ...extraOpen.filter((g) => g !== activeGroup)] : extraOpen;
  const isOpen = (key: string) => openGroups.includes(key);

  function handleGroupToggle(next: string[]) {
    // Radix multiple-select value: every section that should now be open. The
    // active section is re-added by `openGroups`, so a click on it is a no-op.
    setExtraOpen(next.filter((g) => g !== activeGroup));
  }

  const logo = (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center px-4",
        // On desktop the logo is its own white card, separate from the navigation panel below it.
        split ? "h-[3.75rem] rounded-[1.75rem] bg-sidebar shadow-card" : "h-[4.5rem]",
        collapsed && "px-2",
      )}
    >
      {collapsed ? (
        <img src={logoIcon} alt="Swapngo" className="h-9 w-9 shrink-0" />
      ) : (
        <img src={logoWordmark} alt="Swapngo" className="h-7 w-auto" />
      )}
    </div>
  );

  return (
    <div className={cn("flex h-full flex-col text-sidebar-foreground", split ? "gap-2" : "bg-sidebar")}>
      {split ? logo : null}
      {/* The panel: the whole sidebar on a phone; on desktop just the navigation, below the logo's own card. */}
      <div className={cn("flex min-h-0 flex-1 flex-col", split && "overflow-hidden rounded-[1.75rem] bg-sidebar shadow-card")}>
      {split ? null : logo}

      {/* In the split layout the panel starts at its first entry (the logo is a separate card), so it needs its own breathing room at the top. */}
      <nav className={cn("flex-1 space-y-1 overflow-y-auto scrollbar-nav px-3 pb-3", split && "pt-4")}>
        {collapsed ? (
          // Icon rail — group labels have nowhere to go at this width, so
          // every item (grouped or not) renders flat, same as before groups existed.
          <div className="flex flex-col items-center gap-2">
            {items.map((item) => (
              <NavItemLink key={item.path} item={item} collapsed onNavigate={onNavigate} />
            ))}
          </div>
        ) : (
          <Accordion type="multiple" value={openGroups} onValueChange={handleGroupToggle} className="space-y-0.5">
            {tree.map((entry) =>
              entry.type === "item" ? (
                <NavItemLink key={entry.item.path} item={entry.item} collapsed={collapsed} onNavigate={onNavigate} />
              ) : (
                <AccordionItem
                  key={entry.key}
                  value={entry.key}
                  // The open section is a tinted block, so which section you are in reads at a glance.
                  className={cn("rounded-[1.125rem] border-0 px-1 transition-colors", isOpen(entry.key) && "my-1 bg-primary/[0.07]")}
                >
                  <AccordionTrigger
                    className={cn(
                      "rounded-xl px-2 py-2 text-sm font-medium hover:no-underline",
                      entry.key === activeGroup
                        // The current page's section can't be closed, so its header doesn't look clickable.
                        ? "cursor-default font-semibold text-foreground hover:text-foreground [&>svg]:opacity-0"
                        : isOpen(entry.key)
                          ? "font-semibold text-foreground hover:bg-primary/10"
                          : "text-sidebar-foreground/70 hover:bg-primary/10",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.625rem] transition-smooth",
                          entry.key === activeGroup ? "bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_hsl(var(--primary)/0.7)]" : "",
                        )}
                      >
                        <entry.icon className="h-[1.0625rem] w-[1.0625rem]" strokeWidth={1.75} />
                      </span>
                      {entry.label}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-1.5">
                    <div className="ml-6 space-y-0.5 border-l-2 border-border pl-3">
                      {entry.items.map((item) => (
                        <NavItemLink key={item.path} item={item} child onNavigate={onNavigate} />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ),
            )}
          </Accordion>
        )}
      </nav>

      {/* Settings, who is signed in, and the collapse button: always the last thing in the panel. */}
      <div className={cn("shrink-0 space-y-1.5 border-t border-border px-3 pb-2 pt-3", collapsed && "px-2")}>
        {settings ? <NavItemLink item={settings} collapsed={collapsed} onNavigate={onNavigate} /> : null}
        <AccountCard collapsed={collapsed} />
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="hidden w-full items-center justify-center gap-2 rounded-xl py-2 text-xs text-sidebar-foreground/60 transition-smooth hover:bg-sidebar-foreground/5 md:flex"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
