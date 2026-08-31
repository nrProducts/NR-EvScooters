import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, Home, Bike, Wallet, User, Bell, ShieldCheck, LifeBuoy, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { useUnreadCount } from "../hooks/queries";
import { Logo } from "../components/Logo";
import { RiderAvatar } from "../components/common";

interface NavEntry {
  to: string;
  label: string;
  icon: typeof Home;
  show?: boolean;
}

export function RiderLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useRiderAuthStore((s) => s.profile);
  const signOut = useRiderAuthStore((s) => s.signOut);
  const { data: unread } = useUnreadCount();
  const [menuOpen, setMenuOpen] = useState(false);

  const hasVehicle = !!profile && (profile.has_active_booking || profile.has_active_rental);

  const items: NavEntry[] = [
    { to: "/rider", label: "Home", icon: Home },
    { to: "/rider/scooter", label: "My Scooter", icon: Bike, show: hasVehicle },
    { to: "/rider/billing", label: "Billing", icon: Wallet, show: hasVehicle },
    { to: "/rider/kyc", label: "Identity Verification", icon: ShieldCheck, show: !profile?.can_rent },
    { to: "/rider/notifications", label: "Notifications", icon: Bell },
    { to: "/rider/support", label: "Support", icon: LifeBuoy },
    { to: "/rider/account", label: "Account", icon: User },
  ];

  const go = (to: string) => {
    setMenuOpen(false);
    navigate(to);
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[520px] flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            aria-label="Menu"
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button onClick={() => navigate("/rider")} aria-label="SwapNgo home">
            <Logo />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Notifications"
            onClick={() => navigate("/rider/notifications")}
            className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"
          >
            <Bell className="h-5 w-5" />
            {!!unread && unread > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
            )}
          </button>
          <button aria-label="Account" onClick={() => navigate("/rider/account")}>
            <RiderAvatar className="h-9 w-9" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-10 pt-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2.5rem)" }}>
        <Outlet />
      </main>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex items-center gap-3">
              <RiderAvatar className="h-11 w-11" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{profile?.email || profile?.phone}</p>
              </div>
            </div>
          </SheetHeader>

          <nav className="flex flex-col p-2">
            {items
              .filter((i) => i.show !== false)
              .map((i) => {
                const active =
                  i.to === "/rider" ? location.pathname === "/rider" : location.pathname.startsWith(i.to);
                return (
                  <button
                    key={i.to}
                    onClick={() => go(i.to)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <i.icon className="h-5 w-5" />
                    {i.label}
                  </button>
                );
              })}
            <div className="my-2 h-px bg-border" />
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-secondary"
            >
              <LogOut className="h-5 w-5" />
              Log out
            </button>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
