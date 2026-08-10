import { useCallback, useEffect, useState } from 'react';
import { maintenanceRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type { ApiMaintenanceRecord, MaintenanceStatus } from '../types/api';

const PAGE_SIZE = 10;

/** 'all' is a UI-only value — it means "send no status filter". */
export type MaintenanceStatusFilter = MaintenanceStatus | 'all';

/**
 * Paged maintenance history for ONE scooter, driving the My Scooter list.
 *
 * The server already scopes results to vehicles this rider rented and to
 * tickets raised from their pickup onward, so `vehicleId` here narrows an
 * already-safe set rather than being the access check itself.
 *
 * Plain useState/useEffect over the repository, matching useCurrentRideOrBooking
 * — the rental/maintenance path doesn't use react-query.
 */
export function useMaintenanceHistory(vehicleId: string | null) {
  const [items, setItems] = useState<ApiMaintenanceRecord[]>([]);
  const [status, setStatusState] = useState<MaintenanceStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (targetPage: number, targetStatus: MaintenanceStatusFilter) => {
      if (!vehicleId) {
        setItems([]);
        setLoading(false);
        return;
      }

      const append = targetPage > 1;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      maintenanceRepository
        .history({
          vehicleId,
          page: targetPage,
          pageSize: PAGE_SIZE,
          ...(targetStatus === 'all' ? {} : { status: targetStatus }),
        })
        .then((res) => {
          // Append rather than replace on "load more", but never on a filter
          // change — those reset to page 1 and must not keep the old rows.
          setItems((prev) => (append ? [...prev, ...res.data] : res.data));
          setPage(res.pagination.page);
          setTotalPages(res.pagination.totalPages);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? err.message : 'Could not load maintenance history.');
        })
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [vehicleId],
  );

  useEffect(() => {
    fetchPage(1, status);
    // `status` is applied through setStatus below, which refetches itself —
    // this effect only needs to re-run when the scooter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage]);

  const setStatus = (next: MaintenanceStatusFilter) => {
    setStatusState(next);
    fetchPage(1, next);
  };

  return {
    items,
    status,
    setStatus,
    loading,
    loadingMore,
    error,
    hasMore: page < totalPages,
    reload: () => fetchPage(1, status),
    loadMore: () => fetchPage(page + 1, status),
  };
}
