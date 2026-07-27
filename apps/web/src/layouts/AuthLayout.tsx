import { Outlet } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { Bike, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuthLayout() {
  const { theme, toggleTheme } = useUiStore();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary via-background to-secondary px-4 py-10">
      <Button
        variant="ghost"
        size="icon"
        className="fixed right-4 top-4"
        onClick={toggleTheme}
        aria-label="Toggle theme"
      >
        {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      </Button>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-soft">
            <Bike className="h-7 w-7 text-primary-foreground" />
          </div>
          <p className="text-lg font-semibold">Swapngo Fleet Hub</p>
          <p className="text-xs text-muted-foreground">Admin &amp; Staff Console</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
