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
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-border transition-all duration-200 md:block",
          sidebarCollapsed ? "w-16" : "w-64",
        )}
      >
        <Sidebar
          role={user.role}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </aside>

      {/* Mobile sidebar in a sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar role={user.role} onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin pb-16 sm:pb-6">
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
            <PageFade key={location.pathname}>
              <Outlet />
            </PageFade>
          </div>
        </main>
      </div>
    </div>
  );
}
