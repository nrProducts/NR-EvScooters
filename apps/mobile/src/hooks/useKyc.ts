import { useCallback, useEffect, useMemo, useState } from 'react';
import { kycRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type { ApiDocument, ApiKycSummary, KycDocType } from '../types/api';
import type { UpdateDocumentInput, UploadDocumentInput } from '../services/types';

const asApiError = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', fallback);

/** The signed-in rider's own KYC: summary plus every mutation they can make. */
export function useMyKyc() {
  const [kyc, setKyc] = useState<ApiKycSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [uploading, setUploading] = useState<KycDocType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setKyc(await kycRepository.mine());
    } catch (err) {
      setError(asApiError(err, 'Could not load your KYC.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  /** Re-reads KYC and returns this type's pending/verified document, if any. Never throws. */
  const findOnFile = useCallback(async (type: KycDocType): Promise<ApiDocument | null> => {
    try {
      const summary = await kycRepository.mine();
      setKyc(summary);
      return summary.documents.find(
        (d) => d.document_type === type && d.verification_status !== 'rejected',
      ) ?? null;
    } catch {
      return null;
    }
  }, []);

  const actions = useMemo(
    () => ({
      /** Uploads a new document, or corrects a rejected one in place. */
      upload: async (input: UploadDocumentInput, existingId?: string) => {
        setUploading(input.doc_type);
        try {
          const result = existingId
            ? await kycRepository.updateMine(existingId, {
                doc_number: input.doc_number,
                expires_on: input.expires_on,
                front: input.front,
                back: input.back,
              })
            : await kycRepository.uploadMine(input);
          await load('refresh');
          return result;
        } catch (err) {
          // 409 on a NEW upload means the server already holds a pending or
          // verified document of this type — typically an earlier attempt the
          // app gave up on (timeout) but the server saved, or a second request
          // from the same press. The rider's document is on file, so treat it
          // as the success it is rather than a dead-end error.
          if (!existingId && err instanceof ApiError && err.status === 409) {
            const onFile = await findOnFile(input.doc_type);
            if (onFile) return onFile;
          }
          return asApiError(err, 'Upload failed. Please try again.');
        } finally {
          setUploading(null);
        }
      },

      update: async (documentId: string, input: UpdateDocumentInput) => {
        try {
          const result = await kycRepository.updateMine(documentId, input);
          await load('refresh');
          return result;
        } catch (err) {
          return asApiError(err, 'Could not update the document.');
        }
      },

      remove: async (documentId: string) => {
        try {
          await kycRepository.deleteMine(documentId);
          await load('refresh');
          return null;
        } catch (err) {
          return asApiError(err, 'Could not remove the document.');
        }
      },

      previewUrl: async (documentId: string, side: 'front' | 'back') => {
        try {
          return await kycRepository.myDocumentUrl(documentId, side);
        } catch (err) {
          return asApiError(err, 'Preview unavailable.');
        }
      },

      submit: async () => {
        setSubmitting(true);
        try {
          const result = await kycRepository.submitMine();
          setKyc(result);
          return result;
        } catch (err) {
          return asApiError(err, 'Could not submit your KYC.');
        } finally {
          setSubmitting(false);
        }
      },
    }),
    [load, findOnFile],
  );

  return {
    kyc,
    loading,
    refreshing,
    error,
    uploading,
    submitting,
    refresh: () => load('refresh'),
    retry: () => load('initial'),
    actions,
  };
}
