import logoIcon from "@/assets/logo-icon.png";
import logoWordmarkGreen from "@/assets/logo-wordmark-green.svg";
import logoMark from "@/assets/logo-mark.svg";

/**
 * The console's logos: the brand-green originals in BOTH themes. The night
 * variants (headlight on) are reserved for the rider app's Home hero card, so
 * every console page shows the normal logo even in dark mode.
 */
export function useBrandLogos(): { icon: string; wordmark: string; mark: string } {
  return { icon: logoIcon, wordmark: logoWordmarkGreen, mark: logoMark };
}
