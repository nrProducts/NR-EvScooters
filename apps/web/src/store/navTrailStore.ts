import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TrailEntry } from "@/lib/navTrail";

interface NavTrailState {
  /** Every console page seen in this tab, by history slot. See lib/navTrail.ts. */
  entries: Record<number, TrailEntry>;
  /** Names detail pages gave themselves (a rider's name, a plate), by location.key. */
  labels: Record<string, string>;
  record: (entry: TrailEntry, isPush: boolean) => void;
  setLabel: (key: string, label: string) => void;
}

/**
 * Session storage, like the list screens' filters: it is per browser tab, as
 * the history it mirrors is, and it survives a reload, which keeps the same
 * history slots, so the trail is still right after F5.
 */
export const useNavTrailStore = create<NavTrailState>()(
  persist(
    (set) => ({
      entries: {},
      labels: {},
      record: (entry, isPush) =>
        set((s) => {
          const entries: Record<number, TrailEntry> = {};
          for (const e of Object.values(s.entries)) {
            // A push discards the forward history, as the browser does.
            if (isPush && e.idx > entry.idx) continue;
            entries[e.idx] = e;
          }
          entries[entry.idx] = entry;
          // Drop names of pages no longer in history. The current key is kept
          // even before it is recorded: a page's effect sets its label before
          // the tracker's (parent) effect records the page.
          const live = new Set(Object.values(entries).map((e) => e.key));
          const labels: Record<string, string> = {};
          for (const [k, v] of Object.entries(s.labels)) if (live.has(k)) labels[k] = v;
          return { entries, labels };
        }),
      setLabel: (key, label) =>
        set((s) => (s.labels[key] === label ? s : { labels: { ...s.labels, [key]: label } })),
    }),
    {
      name: "nav.trail",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ entries: s.entries, labels: s.labels }),
    },
  ),
);
