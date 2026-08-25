import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import type { ApiPrivacySummary } from '../types/api';

/**
 * The rider's DPDPA s.11 summary.
 *
 * Nothing is cached to disk. The summary is read on demand and lives only in
 * component state — it is the most concentrated view of a rider's record the
 * app produces, and it should not outlive the screen showing it.
 *
 * Same bespoke-hook shape as useConsent and usePrivacyRequests rather than
 * React Query, which is only wired into the battery-stations feature module.
 */
export function usePrivacySummary() {
    const [summary, setSummary] = useState<ApiPrivacySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSummary(await api.privacySummary());
        } catch (err) {
            setError(
                err instanceof ApiError ? err.message : 'Could not load your data summary.',
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return { summary, loading, error, reload: load };
}
