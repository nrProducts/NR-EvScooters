import { useMemo, useRef } from "react";
import {
  hashKey,
  useQuery as useTanstackQuery,
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { isListKey, markRefreshing } from "./placeholderRows";

/**
 * Drop-in `useQuery` for the whole console. Identical to TanStack's, except
 * for LIST queries (keys ending in a filters object, e.g. ["users", {…}] or
 * ["leave", "me", {…}]): while one is fetching, its rows come back marked so
 * <DataTable> keeps them on screen dimmed under the loader.
 *
 * "Fetching" here covers every way a list reloads — a new filter/page/sort
 * (whether or not that combination was cached before), a refetch after a
 * save, the Retry button — except a list's own background polling
 * (refetchInterval), which would otherwise flash the overlay every 30 s.
 */
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>): UseQueryResult<TData, TError> {
  const result = useTanstackQuery(options);

  const isList = isListKey(options.queryKey);
  const keyHash = hashKey(options.queryKey);
  // The key whose data last finished loading. A fetch for any other key is a
  // filter/page change; a fetch for this same key is a refetch.
  const settledKey = useRef(keyHash);
  if (!result.isFetching) settledKey.current = keyHash;

  const polling = !!options.refetchInterval;
  const refreshing = isList
    && result.isFetching
    && !result.isLoading
    && (result.isPlaceholderData || !polling || settledKey.current !== keyHash);

  const data = useMemo(
    () => (refreshing ? markRefreshing(result.data) : result.data) as TData | undefined,
    [refreshing, result.data],
  );

  return refreshing ? ({ ...result, data } as UseQueryResult<TData, TError>) : result;
}
