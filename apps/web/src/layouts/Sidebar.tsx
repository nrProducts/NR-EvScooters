import { useEffect, useState } from "react";
import { NavLink, useLocation, useMatch, useNavigate } from "react-router-dom";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildNavTree, navForUser, type NavItem } from "@/routes/roleConfig";
import type { StaffUser } from "@/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import logoMark from "@/assets/logo-mark.svg";
import logoWordmarkGreen from "@/assets/logo-wordmark-green.svg";

/**
 * Hoisted to module scope deliberately — a component defined INSIDE Sidebar's
 * body gets a new function identity every Sidebar render, which React treats
 * as a different component type, unmounting and remounting every nav link on
 * every re-render.
 */
function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  // Hook must run unconditionally; only the collapsed branch below uses it.
  const isActive = !!useMatch({ path: item.path, end: false });

  // --- Expanded sidebar: original token-based styling, untouched ---
  if (!collapsed) {
    return (
      <NavLink
        to={item.path}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-smooth",
            isActive
              ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.5)]"
              : "text-sidebar-foreground/70 hover:bg-primary/10 hover:text-primary",
          )
        }
      >
        <item.icon className="h-[1.125rem] w-[1.125rem] shrink-0" strokeWidth={1.75} />
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  }

  // --- Collapsed icon rail: inline styles so nothing in the cascade can hide
  // the icon or the active-state green. Module name moves to a hover tooltip. ---
  const fg = isActive ? "#ffffff" : "#64748B";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.path}
          onClick={onNavigate}
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-smooth"
          style={{
            backgroundColor: isActive ? "#21C45D" : "#F1F5F9",
            boxShadow: isActive ? "0 6px 16px -4px rgba(33,196,93,0.5)" : undefined,
          }}
        >
          <item.icon className="h-[1rem] w-[1rem] shrink-0" strokeWidth={1.75} style={{ color: fg }} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({
  user,
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  user: Pick<StaffUser, "role" | "permissions">;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const items = navForUser(user);
  const tree = buildNavTree(items);
  const location = useLocation();
  const navigateTo = useNavigate();
  // Only ever holds a group the user opened by hand while browsing an
  // UNGROUPED page (Dashboard/Settings) — see `openGroup` below. It never
  // needs to record the active route's own group, because that's derived,
  // not stored, which is what keeps this whole thing from drifting out of
  // sync with the real active page.
  const [manualOpenGroup, setManualOpenGroup] = useState<string | undefined>(undefined);

  // Longest-prefix match, mirroring NavLink's own isActive semantics.
  const activeItem = [...items]
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  // Landing on an ungrouped page (Dashboard/Settings) closes any section the
  // user had opened by hand — the sidebar shouldn't keep an unrelated group
  // expanded once you've navigated away from it.
  useEffect(() => {
    if (activeItem && !activeItem.group) setManualOpenGroup(undefined);
  }, [activeItem?.path, activeItem?.group]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The single source of truth for which section is expanded. The active
   * route's own group ALWAYS wins — a page can never end up with its own
   * parent section collapsed, on first load, mid-session, after a refresh,
   * or via browser back/forward, because this is recomputed from `location`
   * on every render rather than synced into state that could fall behind it.
   * `manualOpenGroup` only ever matters while browsing an ungrouped page
   * (Dashboard, Settings), where there's no active group to defer to.
   */
  const openGroup = activeItem?.group ?? manualOpenGroup;

  /**
   * A group has no route of its own (NAV_GROUPS carries no `path`) — it's a
   * pure container. "First item in NAV_ITEMS order that both belongs to this
   * group AND survived permission filtering" is the one deterministic,
   * always-authorized choice.
   */
  function firstItemInGroup(groupKey: string): NavItem | undefined {
    return items.find((item) => item.group === groupKey);
  }

  /**
   * Fired only by a real user click/keypress on a trigger. `nextValue` is
   * Radix's single-select value: the newly-opened group's key, or `""` when
   * collapsing (this accordion is `collapsible`).
   *
   * Opening a DIFFERENT group than the one the active route already lives in
   * navigates to that group's first item, so expanding a section always
   * lands you somewhere inside it. Opening the active route's own group (or
   * closing it) never navigates — and per `openGroup` above, an attempt to
   * close the active group doesn't actually collapse it, since that value
   * only feeds `manualOpenGroup`, which is never consulted while a group is
   * active.
   */
  function handleGroupToggle(nextValue: string) {
    const opened = nextValue || undefined;
    if (opened && opened !== activeItem?.group) {
      const firstItem = firstItemInGroup(opened);
      if (firstItem) {
        navigateTo(firstItem.path);
        onNavigate?.();
      }
    }
    setManualOpenGroup(opened);
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 items-center justify-center border-b border-border px-4", collapsed && "px-2")}>
        {collapsed ? (
          <img src={logoMark} alt="Swapngo" className="h-8 w-8 shrink-0" />
        ) : (
          <img src={logoWordmarkGreen} alt="Swapngo" className="h-6 w-auto" />
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-nav px-2 py-4">
        {collapsed ? (
          // Icon rail — group labels have nowhere to go at this width, so
          // every item (grouped or not) renders flat, same as before groups existed.
          <div className="flex flex-col items-center gap-2">
            {items.map((item) => (
              <NavItemLink key={item.path} item={item} collapsed onNavigate={onNavigate} />
            ))}
          </div>
        ) : (
          <Accordion type="single" collapsible value={openGroup ?? ""} onValueChange={handleGroupToggle} className="space-y-1">
            {tree.map((entry) =>
              entry.type === "item" ? (
                <NavItemLink key={entry.item.path} item={entry.item} collapsed={collapsed} onNavigate={onNavigate} />
              ) : (
                <AccordionItem key={entry.key} value={entry.key} className="border-0">
                  <AccordionTrigger
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm font-medium transition-smooth hover:bg-primary/10 hover:text-primary hover:no-underline",
                      // The active leaf already gets its own highlighted background —
                      // this is just enough to show its parent section at a glance too.
                      entry.key === activeItem?.group
                        ? "text-sidebar-foreground"
                        : "text-sidebar-foreground/70",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <entry.icon className="h-[1.125rem] w-[1.125rem] shrink-0" strokeWidth={1.75} />
                      {entry.label}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-1 pb-0 pl-4">
                    {entry.items.map((item) => (
                      <NavItemLink key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ),
            )}
          </Accordion>
        )}
      </nav>

      {onToggleCollapsed && (
        <button
          onClick={onToggleCollapsed}
          className="hidden items-center justify-center gap-2 border-t border-border py-3 text-xs text-sidebar-foreground/60 transition-smooth hover:bg-sidebar-foreground/5 md:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      )}
    </div>
  );
}
