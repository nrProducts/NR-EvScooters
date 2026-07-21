import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { userRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type {
    AccountStatus, ApiUser, ApiUserDetail, CreateUserPayload, KycStatus, Pagination,
    StatusAction, UpdateUserPayload,
} from '../types/api';

const PAGE_SIZE = 20;

export interface UserFilters {
    search: string;
    accountStatus: AccountStatus | 'all';
    kycStatus: KycStatus | 'all';
    includeDeleted: boolean;
}

export const DEFAULT_USER_FILTERS: UserFilters = {
    search: '',
    accountStatus: 'all',
    kycStatus: 'all',
    includeDeleted: false,
};

/**
 * Owns everything about fetching and mutating the user list: request state,
 * pagination bookkeeping, and keeping the local array honest after a change.
 * The screen renders what this returns and calls these actions — it never
 * touches the repository, and never knows whether it's mock or live.
 */
export function useUsers(filters: UserFilters) {
    const [users, setUsers] = useState<ApiUser[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<ApiError | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    /**
     * Guards against a slow first request resolving after a newer one and
     * overwriting fresher results — easy to hit by typing in the search box.
     */
    const requestId = useRef(0);

    const query = useMemo(
        () => ({
            pageSize: PAGE_SIZE,
            search: filters.search.trim() || undefined,
            accountStatus: filters.accountStatus === 'all' ? undefined : filters.accountStatus,
            kycStatus: filters.kycStatus === 'all' ? undefined : filters.kycStatus,
            includeDeleted: filters.includeDeleted || undefined,
        }),
        [filters],
    );

    const load = useCallback(
        async (mode: 'initial' | 'refresh' = 'initial') => {
            const id = ++requestId.current;
            if (mode === 'refresh') setRefreshing(true);
            else setLoading(true);
            setError(null);

            try {
                const res = await userRepository.list({ ...query, page: 1 });
                if (id !== requestId.current) return; // superseded
                setUsers(res.data);
                setPagination(res.pagination);
            } catch (err) {
                if (id !== requestId.current) return;
                setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Could not load users.'));
            } finally {
                if (id === requestId.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [query],
    );

    useEffect(() => {
        void load('initial');
    }, [load]);

    const loadMore = useCallback(async () => {
        if (loadingMore || !pagination || pagination.page >= pagination.totalPages) return;
        setLoadingMore(true);
        try {
            const res = await userRepository.list({ ...query, page: pagination.page + 1 });
            setUsers((prev) => [...prev, ...res.data]);
            setPagination(res.pagination);
        } catch {
            // A failed page-append isn't worth destroying the list on screen;
            // pull-to-refresh remains available.
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, pagination, query]);

    const replace = useCallback((updated: ApiUserDetail) => {
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    }, []);

    /**
     * Runs a mutation with the row marked busy and errors normalised. Returns
     * the ApiError instead of throwing, so screens can show it without a
     * try/catch around every call.
     */
    const run = useCallback(async <T,>(id: string, action: () => Promise<T>): Promise<T | ApiError> => {
        setBusyId(id);
        try {
            return await action();
        } catch (err) {
            return err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Please try again.');
        } finally {
            setBusyId(null);
        }
    }, []);

    const actions = useMemo(
        () => ({
            getDetail: (id: string) => run(id, () => userRepository.get(id)),

            create: async (payload: CreateUserPayload) => {
                try {
                    const created = await userRepository.create(payload);
                    await load('refresh'); // a new row may not belong on page 1 under current sort
                    return created;
                } catch (err) {
                    return err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Please try again.');
                }
            },

            update: async (id: string, patch: UpdateUserPayload) => {
                const result = await run(id, () => userRepository.update(id, patch));
                if (!(result instanceof ApiError)) replace(result);
                return result;
            },

            changeStatus: async (id: string, action: StatusAction, reason?: string) => {
                const result = await run(id, () => userRepository.changeStatus(id, action, reason));
                if (!(result instanceof ApiError)) replace(result);
                return result;
            },

            remove: async (id: string) => {
                const result = await run(id, () => userRepository.remove(id));
                if (!(result instanceof ApiError)) {
                    // Deleted rows leave the default list, so drop it locally
                    // rather than re-fetching the page.
                    if (filters.includeDeleted) void load('refresh');
                    else setUsers((prev) => prev.filter((u) => u.id !== id));
                }
                return result;
            },

            restore: async (id: string) => {
                const result = await run(id, () => userRepository.restore(id));
                if (!(result instanceof ApiError)) replace(result);
                return result;
            },
        }),
        [run, replace, load, filters.includeDeleted],
    );

    return {
        users,
        pagination,
        loading,
        refreshing,
        loadingMore,
        error,
        busyId,
        refresh: () => load('refresh'),
        retry: () => load('initial'),
        loadMore,
        actions,
    };
}
