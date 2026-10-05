import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import { useT } from '../i18n';
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
 *
 * `category.label/what/retention`, `recipient.name/receives/why` and
 * `not_held` are composed server-side in English by
 * apps/backend/.../privacy.service.ts — a DPDPA disclosure, not app chrome,
 * so it is deliberately NOT re-typed here. Localising it properly means the
 * backend rendering the summary in the rider's `preferred_language` (now
 * possible, since that column exists), which is backend work outside this
 * mobile-only change — see the note on notifications.tsx for the same
 * boundary.
 */
export function usePrivacySummary() {
    const { t } = useT();
    const [summary, setSummary] = useState<ApiPrivacySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSummary(await api.privacySummary());
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('privacySummary.loadFailed'));
        } finally {
            setLoading(false);
        }
    // `t` deliberately omitted: this only runs once on mount, and re-creating
    // it on every language change would be pointless churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return { summary, loading, error, reload: load };
}
