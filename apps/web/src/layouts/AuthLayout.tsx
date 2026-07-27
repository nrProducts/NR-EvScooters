import { Outlet } from "react-router-dom";
import { Zap } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { Moon, Sun } from "lucide-react";
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Zap className="h-6 w-6" />
          </div>
          <p className="text-lg font-semibold">Swapngo Fleet Hub</p>
          <p className="text-xs text-muted-foreground">Admin &amp; Staff Console</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
