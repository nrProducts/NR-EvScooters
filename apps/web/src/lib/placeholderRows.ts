/**
 * "These rows are being reloaded" — the marker <DataTable> looks for to keep
 * the rows on screen, dimmed, under the loader, instead of blanking the grid.
 *
 * Two pieces:
 *  - keepListRows (queryClient's placeholderData): when a list's key changes
 *    (filter/page/sort), keep showing the previous rows until the new ones land.
 *  - markRefreshing (lib/useQuery): while a list is fetching for any reason,
 *    hand its rows back marked.
 *
 * The marker rides on the row array itself so no page has to pass a flag:
 * anything that hands `data?.data` straight to <DataTable> gets the overlay,
 * and a page that maps/filters the rows first simply drops the marker.
 */
const REFRESHING = Symbol("refreshingRows");

type Marked = unknown[] & { [REFRESHING]?: true };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function mark<T>(rows: T[]): T[] {
  const copy = [...rows] as Marked;
  copy[REFRESHING] = true;
  return copy as T[];
}

export function isPlaceholderRows(rows: unknown): boolean {
  return Array.isArray(rows) && (rows as Marked)[REFRESHING] === true;
}

/**
 * A LIST query is one whose key ends in a filters object — ["users", {…}],
 * ["leave", "me", {…}], ["stations", "admin", {…}]. Detail queries end in an
 * id (["invoice", id]) and are never kept or marked, so a dialog never shows
 * the previous record under a new id.
 */
export function isListKey(key: readonly unknown[] | undefined): boolean {
  return !!key && key.length > 1 && isPlainObject(key[key.length - 1]);
}

/** Marks the rows of a list result — paginated `{ data: rows, … }` or a bare array. */
export function markRefreshing(data: unknown): unknown {
  if (Array.isArray(data)) return mark(data);
  if (isPlainObject(data) && Array.isArray(data.data)) return { ...data, data: mark(data.data) };
  return data;
}

/** queryClient `placeholderData`: keep a list's previous result while its new key loads. */
export function keepListRows(
  previousData: unknown,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
): unknown {
  if (!previousData || !isListKey(previousQuery?.queryKey)) return undefined;
  return previousData;
}
