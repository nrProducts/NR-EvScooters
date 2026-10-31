import { useEffect } from "react";
import { usePageHeaderStore } from "@/store/pageHeaderStore";

/**
 * Gives the top header this page's own title to show in place of the route's
 * label. Use it where a page has a better title than the menu name ("Revenue
 * Overview" rather than "Revenue"), so the title sits in the header row and the
 * page does not repeat it below. Resets itself on unmount.
 */
export function usePageTitle(title: string): void {
  const setTitle = usePageHeaderStore((s) => s.setTitle);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
}
