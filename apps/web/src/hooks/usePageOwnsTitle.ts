import { useEffect } from "react";
import { usePageHeaderStore } from "@/store/pageHeaderStore";

/**
 * Call from a page that renders its own heading. The top header then hides its
 * title and subtitle for as long as the page is mounted, so the screen does not
 * show two headings one above the other. Resets itself on unmount.
 */
export function usePageOwnsTitle(): void {
  const setOwnsTitle = usePageHeaderStore((s) => s.setOwnsTitle);
  useEffect(() => {
    setOwnsTitle(true);
    return () => setOwnsTitle(false);
  }, [setOwnsTitle]);
}
