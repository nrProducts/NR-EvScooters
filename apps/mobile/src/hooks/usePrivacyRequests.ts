import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import type {
    ApiPrivacyRequest, CorrectableField, DpRequestType,
} from '../types/api';

/**
 * The rider's own rights requests.
 *
 * Same bespoke-hook shape as useConsent and the older screens, rather than
 * React Query, which is only wired into the battery-stations feature module.
 */
export function usePrivacyRequests() {
    const [requests, setRequests] = useState<ApiPrivacyRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const page = await api.myPrivacyRequests({ page: 1, pageSize: 50 });
            setRequests(page.data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load your requests.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const create = useCallback(
        async (input: {
            type: DpRequestType;
            details?: string;
            requested_changes?: { field: CorrectableField; value: string }[];
        }) => {
            setSubmitting(true);
            setError(null);
            try {
                const created = await api.createPrivacyRequest(input);
                setRequests((prev) => [created, ...prev]);
                return { ok: true as const, request: created };
            } catch (err) {
                const message = err instanceof ApiError
                    ? err.message
                    : 'Could not send your request.';
                setError(message);
                return { ok: false as const, message };
            } finally {
                setSubmitting(false);
            }
        },
        [],
    );

    const cancel = useCallback(async (id: string) => {
        setSubmitting(true);
        setError(null);
        try {
            const updated = await api.cancelPrivacyRequest(id);
            setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
            return { ok: true as const };
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not cancel that request.');
            return { ok: false as const };
        } finally {
            setSubmitting(false);
        }
    }, []);

    return { requests, loading, submitting, error, reload: load, create, cancel };
}
