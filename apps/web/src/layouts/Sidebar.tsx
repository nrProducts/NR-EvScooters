import { NavLink } from "react-router-dom";
import { Zap, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { navForRole } from "@/routes/roleConfig";
import type { Role } from "@/types";

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

  return (
    <div className="flex h-full flex-col bg-card">
      <div className={cn("flex h-16 items-center gap-2 border-b border-border px-4", collapsed && "justify-center px-2")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-[18px] w-[18px]" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">Swapngo</p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">Fleet Hub Admin</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto scrollbar-thin px-2 py-3">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                collapsed && "justify-center px-0",
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {onToggleCollapsed && (
        <button
          onClick={onToggleCollapsed}
          className="hidden items-center justify-center gap-2 border-t border-border py-3 text-xs text-muted-foreground hover:bg-secondary md:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      )}
    </div>
  );
}
