import { Outlet } from "react-router-dom";
import { useUiStore } from "@/store/uiStore";
import { Moon, Sun } from "lucide-react";
import logoWordmark from "@/assets/logo-wordmark.svg";
import logoWordmarkDark from "@/assets/logo-wordmark-dark.svg";

export function AuthLayout() {
  const { theme, toggleTheme } = useUiStore();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Subtle abstract green glow — kept faint and non-distracting. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-24 h-[28rem] w-[28rem] rounded-full bg-primary/5 blur-[120px]"
      />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="fixed right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-soft backdrop-blur transition-smooth hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {theme === "light" ? <Moon className="h-[1.05rem] w-[1.05rem]" /> : <Sun className="h-[1.05rem] w-[1.05rem]" />}
      </button>

      <div className="relative w-full max-w-[27.5rem]">
        <div className="mb-6 flex justify-center">
          <img src={theme === "dark" ? logoWordmarkDark : logoWordmark} alt="Swapngo" className="h-8 w-auto" />
        </div>
        <Outlet />
      </div>
    </div>
  );
}
