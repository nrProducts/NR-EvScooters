import { QueryClient } from "@tanstack/react-query";
import { keepListRows } from "./placeholderRows";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
      // Changing a list's filter/page/sort keeps the current rows on screen
      // (dimmed under a loader by DataTable) instead of flashing a skeleton.
      placeholderData: keepListRows,
    },
  },
});
