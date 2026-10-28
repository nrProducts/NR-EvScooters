import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PageFade } from "@/components/motion/PageFade";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

/**
 * The admin shell: a soft grey canvas, the full labelled sidebar as a tall white
 * panel on the left (it collapses to icons with the button at its foot), and the
 * page header plus the page's own white cards to its right. Phones get the same
 * sidebar in a slide-over sheet, opened from the header.
 */
export function DashboardLayout() {
  const user = useAuthStore((s) => s.user);
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  if (!user) return null;

  return (
    <div className="flex h-screen gap-4 overflow-hidden bg-background p-3">
      {/* Desktop / tablet sidebar — a floating panel, not a flush edge-to-edge bar */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden rounded-[1.75rem] bg-sidebar shadow-card transition-all duration-200 md:block",
          sidebarCollapsed ? "w-[4.5rem]" : "w-64",
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

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin pb-16 sm:pb-2">
          <div className="mx-auto max-w-[1600px]">
            <PageFade key={location.pathname}>
              <Outlet />
            </PageFade>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-1 px-1 pb-1 pt-6 text-[0.6875rem] text-muted-foreground">
            <span>© {new Date().getFullYear()} Swapngo. All rights reserved.</span>
            <span>EV Fleet Admin · v1.0.0</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
