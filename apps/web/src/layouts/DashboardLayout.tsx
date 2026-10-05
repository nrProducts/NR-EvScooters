import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PageFade } from "@/components/motion/PageFade";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

export function DashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  if (!user) return null;

  return (
    <div className="flex h-screen gap-3 overflow-hidden bg-background p-3">
      {/* Desktop / tablet sidebar — a floating panel, not a flush edge-to-edge bar */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden rounded-3xl border border-border/60 shadow-card transition-all duration-200 md:block",
          sidebarCollapsed ? "w-16" : "w-64",
        )}
      >
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* Mobile sidebar in a sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 rounded-r-3xl p-0">
          <Sidebar user={user} onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-card">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin pb-16 sm:pb-6">
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
            <PageFade key={location.pathname}>
              <Outlet />
            </PageFade>
          </div>
        </main>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-t border-border bg-card/80 px-4 py-2 text-[0.6875rem] text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} Swapngo. All rights reserved.</span>
          <span>EV Fleet Admin · v1.0.0</span>
        </footer>
      </div>
    </div>
  );
}
