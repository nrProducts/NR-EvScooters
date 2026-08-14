import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import type { ApiConsentNotice, ApiConsentState, ConsentPurpose } from '../types/api';
import { useLangStore } from '../i18n';

/**
 * The rider's consent state plus the live notice.
 *
 * Follows the existing bespoke-hook shape used by the older screens (see
 * useKyc) rather than React Query, which is only wired into the
 * battery-stations feature module.
 */
export function useConsent() {
    const lang = useLangStore((s) => s.lang);
    const [state, setState] = useState<ApiConsentState | null>(null);
    const [notice, setNotice] = useState<ApiConsentNotice | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [consents, activeNotice] = await Promise.all([
                api.myConsents(),
                api.consentNotice(lang),
            ]);
            setState(consents);
            setNotice(activeNotice);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load your privacy settings.');
        } finally {
            setLoading(false);
        }
    }, [lang]);

    useEffect(() => {
        void load();
    }, [load]);

    /**
     * Submits the full set of choices. A 409 means the notice changed while
     * the screen was open; the caller is told to re-read rather than having a
     * stale acceptance silently recorded.
     */
    const save = useCallback(
        async (grants: { purpose: ConsentPurpose; granted: boolean }[]) => {
            if (!notice) throw new Error('The privacy notice has not loaded yet.');
            setSaving(true);
            setError(null);
            try {
                const next = await api.setConsents({
                    notice_version: notice.version,
                    language: lang,
                    grants,
                });
                setState(next);
                return { ok: true as const };
            } catch (err) {
                const stale = err instanceof ApiError && err.status === 409;
                if (stale) await load();
                setError(
                    err instanceof ApiError ? err.message : 'Could not save your choices.',
                );
                return { ok: false as const, stale };
            } finally {
                setSaving(false);
            }
        },
        [notice, lang, load],
    );

    /** Single optional toggle, written immediately — withdrawal must be one tap. */
    const setOne = useCallback(
        async (purpose: ConsentPurpose, granted: boolean) => {
            if (!notice) return { ok: false as const, stale: false };
            setSaving(true);
            setError(null);
            try {
                const next = granted
                    ? await api.setConsents({
                          notice_version: notice.version,
                          language: lang,
                          grants: [{ purpose, granted: true }],
                      })
                    : await api.withdrawConsent(purpose);
                setState(next);
                return { ok: true as const };
            } catch (err) {
                const stale = err instanceof ApiError && err.status === 409;
                if (stale) await load();
                setError(err instanceof ApiError ? err.message : 'Could not save that change.');
                return { ok: false as const, stale };
            } finally {
                setSaving(false);
            }
        },
        [notice, lang, load],
    );

    return { state, notice, loading, saving, error, reload: load, save, setOne };
}
