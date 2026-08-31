import { Outlet } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoWordmark from "@/assets/logo-wordmark.svg";
import logoWordmarkDark from "@/assets/logo-wordmark-dark.svg";

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
        {theme === "light" ? <Moon className="h-[1.125rem] w-[1.125rem]" /> : <Sun className="h-[1.125rem] w-[1.125rem]" />}
      </Button>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <img src={theme === "dark" ? logoWordmarkDark : logoWordmark} alt="Swapngo" className="h-9 w-auto" />
          <p className="text-xs text-muted-foreground">Sign in to continue</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
