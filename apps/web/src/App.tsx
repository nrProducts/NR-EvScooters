import { useEffect } from "react";
import { AppRoutes } from "@/routes/AppRoutes";
import { useUiStore } from "@/store/uiStore";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <TooltipProvider delayDuration={200}>
      <AppRoutes />
    </TooltipProvider>
  );
}
