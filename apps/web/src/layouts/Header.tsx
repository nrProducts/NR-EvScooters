import { useState } from "react";
import { Menu, Search, Bell, Sun, Moon, LogOut, Settings as SettingsIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { initials } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { theme, toggleTheme } = useUiStore();
  const { user, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobileNav}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search riders, vehicles, bookings..."
          className="pl-9"
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </Button>

        <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")}>
          <Bell className="h-[18px] w-[18px]" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full pl-1 pr-1 outline-none">
              <Avatar className="h-8 w-8">
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
