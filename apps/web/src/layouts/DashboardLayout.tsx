import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import logoIcon from "@/assets/logo-icon.png";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PageFade } from "@/components/motion/PageFade";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

/**
 * The admin shell: a soft grey canvas, the full labelled sidebar as a tall white
 * panel on the left (the logo above it sits on the grey, not on the white) (it collapses to icons with the button at its foot), and the
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
          "hidden shrink-0 transition-all duration-200 md:block",
          sidebarCollapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <Sidebar
          user={user}
          split
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
        {/* Only the page body scrolls; the footer below stays pinned to the bottom of the shell */}
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-4">
          {/* h-full lets a page opt in to filling the viewport (grid scrolls inside, pagination pinned) */}
          <div className="mx-auto h-full max-w-[1600px]">
            <PageFade key={location.pathname}>
              <Outlet />
            </PageFade>
          </div>
        </main>
        <footer className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-card px-4 py-3 shadow-card">
          <div className="flex items-center gap-2.5">
            <img src={logoIcon} alt="" className="h-7 w-7 rounded-lg" />
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Swapngo</span> · © {new Date().getFullYear()} All rights reserved.
            </span>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.6875rem] font-semibold text-primary">
            EV Fleet Admin · v1.0.0
          </span>
        </footer>
      </div>
    </div>
  );
}
