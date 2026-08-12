import { Outlet } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoWordmark from "@/assets/logo-wordmark.png";
import logoWordmarkDark from "@/assets/logo-wordmark-dark.png";

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
          <img src={theme === "dark" ? logoWordmarkDark : logoWordmark} alt="SwapNgo" className="h-9 w-auto" />
          <p className="text-xs text-muted-foreground">Admin &amp; Staff Console</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
