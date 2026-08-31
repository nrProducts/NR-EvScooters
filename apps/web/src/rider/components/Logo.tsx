import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import logoWordmark from "@/assets/logo-wordmark.svg";
import logoWordmarkDark from "@/assets/logo-wordmark-dark.svg";
import logoMark from "@/assets/logo-mark.svg";

/** The SwapNgo wordmark, theme-aware. `mark` renders just the icon glyph. */
export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  const theme = useUiStore((s) => s.theme);
  if (mark) return <img src={logoMark} alt="SwapNgo" className={cn("h-7 w-auto", className)} />;
  return (
    <img
      src={theme === "dark" ? logoWordmarkDark : logoWordmark}
      alt="SwapNgo"
      className={cn("h-6 w-auto", className)}
    />
  );
}
