import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, Sun, Moon, LogOut, RotateCw, Settings as SettingsIcon } from "lucide-react";
import { GlobalSearch } from "@/components/common/GlobalSearch";
import { NotificationBell } from "@/components/common/NotificationBell";
import { PendingApprovalsBell } from "@/components/common/PendingApprovalsBell";
import { HeaderAttendanceControl } from "@/components/common/HeaderAttendanceControl";
import { IconButton } from "@/components/ui/icon-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useUiStore } from "@/store/uiStore";
import { useAuth } from "@/hooks/useAuth";
import { cn, initials, formatDate } from "@/lib/utils";
import { useNavigate, useLocation } from "react-router-dom";
import { matchPath } from "@/routes/roleConfig";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { HEADER_ICON, HEADER_ROUND_BUTTON } from "@/lib/headerStyles";

/**
 * The top of every screen. It sits directly on the grey canvas (no bar, no
 * border): the page's title on the left, search and the round action buttons on
 * the right. The logo lives only in the sidebar. The dashboard greets the person
 * by first name; every other page shows its own title with its subtitle beneath.
 */
export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { theme, toggleTheme } = useUiStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = matchPath(location.pathname)?.label ?? "";
  const pageSubtitle = usePageHeaderStore((s) => s.subtitle);
  // A page that draws its own heading (a user's name, "Revenue Overview") hides ours.
  const ownsTitle = usePageHeaderStore((s) => s.ownsTitle);

  const isDashboard = location.pathname === "/dashboard";
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const title = isDashboard && firstName ? `Hello, ${firstName}!` : pageTitle;

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // Refetch every query the current screen has mounted — the page's own hooks
  // then re-render with fresh data, no per-page wiring needed.
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 px-1 pb-4 pt-1 sm:px-2">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <IconButton
          variant="ghost"
          label="Open navigation menu"
          tooltipSide="bottom"
          className="md:hidden"
          onClick={onOpenMobileNav}
        >
          <Menu className="h-5 w-5" />
        </IconButton>

        {/*
          shrink-0 on the title: without it, flexbox shrinks the title and the
          subtitle proportionally whenever they don't both fit, so even a short
          title like "Privacy Requests" got clipped. The title keeps its full
          width and the (less important) subtitle gives up space first.
        */}
        {!ownsTitle && (
          <div className="min-w-0">
            <h1
              className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl"
              title={title}
            >
              {title}
            </h1>
            {pageSubtitle && (
              <p
                className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block"
                title={typeof pageSubtitle === "string" ? pageSubtitle : undefined}
              >
                {pageSubtitle}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <GlobalSearch />
        {user?.role && (
          <div className="hidden h-9 items-center gap-1.5 rounded-full bg-card px-3 shadow-card xl:flex">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", user.role === "admin" ? "bg-primary" : "bg-info")}
            />
            <span className="text-xs font-semibold capitalize text-foreground">{user.role}</span>
            <span className="text-xs text-muted-foreground">· {formatDate(new Date())}</span>
          </div>
        )}

        <IconButton
          variant="ghost"
          onClick={handleRefresh}
          disabled={refreshing}
          label="Refresh this page"
          tooltipSide="bottom"
          className={cn(HEADER_ROUND_BUTTON, "text-primary hover:text-primary")}
        >
          <RotateCw className={cn(HEADER_ICON, refreshing && "animate-spin")} />
        </IconButton>

        <IconButton
          variant="ghost"
          onClick={toggleTheme}
          label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
          tooltipSide="bottom"
          className={HEADER_ROUND_BUTTON}
        >
          {theme === "light" ? <Moon className={HEADER_ICON} /> : <Sun className={HEADER_ICON} />}
        </IconButton>

        <HeaderAttendanceControl role={user?.role} />

        <PendingApprovalsBell />

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none">
              <Avatar className="h-9 w-9 text-xs shadow-card ring-2 ring-card">
                <AvatarImage src={user?.avatarUrl} alt={user?.name} />
                <AvatarFallback>{user ? initials(user.name) : "?"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="truncate">{user?.name}</p>
              <p className="truncate text-[0.6875rem] font-normal capitalize text-muted-foreground">{user?.role}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {user?.role === "admin" && (
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <SettingsIcon className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
