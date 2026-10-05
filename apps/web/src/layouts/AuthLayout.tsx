import { Outlet } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { Moon, Sun } from "lucide-react";

export function AuthLayout() {
  const { theme, toggleTheme } = useUiStore();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-white px-4 py-10 dark:bg-background">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="fixed right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-soft backdrop-blur transition-smooth hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {theme === "light" ? <Moon className="h-[1.05rem] w-[1.05rem]" /> : <Sun className="h-[1.05rem] w-[1.05rem]" />}
      </button>

      <div className="w-full max-w-[27rem]">
        <Outlet />
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        © 2026 Swapngo. All rights reserved.
      </footer>
    </div>
  );
}
