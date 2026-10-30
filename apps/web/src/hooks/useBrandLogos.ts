import logoIcon from "@/assets/logo-icon.png";
import logoIconDark from "@/assets/logo-icon-dark.png";
import logoWordmarkGreen from "@/assets/logo-wordmark-green.svg";
import logoWordmarkNight from "@/assets/logo-wordmark-night.svg";
import logoMark from "@/assets/logo-mark.svg";
import logoMarkNight from "@/assets/logo-mark-night.svg";
import { useUiStore } from "@/store/uiStore";

/**
 * The console's logos for its current theme. Light mode: the brand-green
 * originals. Dark mode: the same shapes in the dark theme's green (index.css,
 * .dark --primary), so the logo matches the buttons and the active nav item;
 * the square icon is also the night one, with the scooter's headlight on.
 * The dark variants come from apps/mobile/scripts/generate-dark-icons.mjs.
 */
export function useBrandLogos(): { icon: string; wordmark: string; mark: string } {
  const dark = useUiStore((s) => s.theme) === "dark";
  return {
    icon: dark ? logoIconDark : logoIcon,
    wordmark: dark ? logoWordmarkNight : logoWordmarkGreen,
    mark: dark ? logoMarkNight : logoMark,
  };
}
