import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { navForRole } from "@/routes/roleConfig";
import type { Role } from "@/types";
import { useUiStore } from "@/store/uiStore";
import logoMark from "@/assets/logo-mark.svg";
import logoWordmark from "@/assets/logo-wordmark.svg";
import logoWordmarkDark from "@/assets/logo-wordmark-dark.svg";

export function Sidebar({
  role,
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  role: Role;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const items = navForRole(role);
  const theme = useUiStore((s) => s.theme);
  const location = useLocation();
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  // Longest-prefix match, mirroring NavLink's own isActive semantics — avoids
  // relying on framer-motion's mount/unmount layoutId matching, which is
  // sensitive to the nav list's own scroll container and only animated
  // smoothly in one direction (getBoundingClientRect is viewport-relative,
  // so it desyncs whenever a route change also involves the list scrolling).
  // offsetTop/offsetHeight are scroll-position-immune, so a single pill driven
  // off them animates identically regardless of direction.
  const activePath = [...items]
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  useLayoutEffect(() => {
    const el = activePath ? itemRefs.current[activePath] : null;
    setPill(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [activePath, collapsed]);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 items-center justify-center border-b border-border px-4", collapsed && "px-2")}>
        {collapsed ? (
          <img src={logoMark} alt="SwapNgo" className="h-8 w-8 shrink-0" />
        ) : (
          <img src={theme === "dark" ? logoWordmarkDark : logoWordmark} alt="SwapNgo" className="h-6 w-auto" />
        )}
      </div>

      <nav className="relative flex-1 space-y-1 overflow-y-auto scrollbar-thin px-2 py-4">
        {pill && (
          <motion.div
            className="absolute left-2 right-2 z-0 rounded-2xl bg-primary shadow-[0_6px_16px_-4px_hsl(var(--primary)/0.5)]"
            animate={{ top: pill.top, height: pill.height }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          />
        )}
        {items.map((item) => (
          <NavLink
            key={item.path}
            ref={(el) => {
              itemRefs.current[item.path] = el;
            }}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "relative z-10 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-smooth",
                isActive
                  ? "text-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground",
                collapsed && "justify-center px-0",
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
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
