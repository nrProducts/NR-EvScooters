import { useCallback, useEffect, useState } from 'react';
import { referralRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { useT } from '../i18n';
import type { ApiReferralSummary } from '../types/api';

/**
 * The rider's own referral code, programme terms, reward cards and history —
 * same bespoke-hook shape as usePrivacySummary, through the repository (not
 * `api` directly) so this keeps working against the mock fixtures used by
 * tests/mock.repositories.test.ts.
 */
export function useReferralSummary() {
    const { t } = useT();
    const [summary, setSummary] = useState<ApiReferralSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSummary(await referralRepository.mine());
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('referrals.loadFailed'));
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return { summary, loading, error, reload: load };
}
