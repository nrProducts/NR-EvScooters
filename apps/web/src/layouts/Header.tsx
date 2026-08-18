import { Menu, Sun, Moon, LogOut, Settings as SettingsIcon } from "lucide-react";
import { GlobalSearch } from "@/components/common/GlobalSearch";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Button } from "@/components/ui/button";
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
import { useNavigate } from "react-router-dom";

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { theme, toggleTheme } = useUiStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav}>
        <Menu className="h-5 w-5" />
      </Button>

      <GlobalSearch />

      <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-3">
        {user?.role && (
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 lg:flex">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", user.role === "admin" ? "bg-primary" : "bg-info")}
            />
            <span className="text-xs font-semibold capitalize text-foreground">{user.role}</span>
          </div>
        )}
        <span className="hidden h-4 w-px bg-border lg:inline" />
        <span className="hidden text-xs text-muted-foreground lg:inline">{formatDate(new Date())}</span>

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </Button>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 pr-1 outline-none">
              <Avatar className="h-8 w-8 ring-1 ring-border">
                <AvatarImage src={user?.avatarUrl} alt={user?.name} />
                <AvatarFallback>{user ? initials(user.name) : "?"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="truncate">{user?.name}</p>
              <p className="truncate text-[11px] font-normal capitalize text-muted-foreground">{user?.role}</p>
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
