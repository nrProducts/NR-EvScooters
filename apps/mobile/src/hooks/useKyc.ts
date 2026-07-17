import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { kycRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type {
  ApiDocument, ApiKycDetail, ApiKycQueueItem, ApiKycSummary, KycDocType, KycStatus,
  Pagination,
} from '../types/api';
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

  const actions = useMemo(
    () => ({
      /** Uploads a new document, or corrects a rejected one in place. */
      upload: async (input: UploadDocumentInput, existingId?: string) => {
        setUploading(input.doc_type);
        try {
          const result = existingId
            ? await kycRepository.updateMine(existingId, {
                doc_number: input.doc_number,
                expiry_date: input.expiry_date,
                front: input.front,
                back: input.back,
              })
            : await kycRepository.uploadMine(input);
          await load('refresh');
          return result;
        } catch (err) {
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
    [load],
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

/** Staff review queue. */
export function useKycQueue(search: string, status: KycStatus | 'all') {
  const [items, setItems] = useState<ApiKycQueueItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const requestId = useRef(0);

  const query = useMemo(
    () => ({
      pageSize: 20,
      search: search.trim() || undefined,
      status: status === 'all' ? undefined : status,
    }),
    [search, status],
  );

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const id = ++requestId.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await kycRepository.queue({ ...query, page: 1 });
        if (id !== requestId.current) return; // superseded by a newer search
        setItems(res.data);
        setPagination(res.pagination);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(asApiError(err, 'Could not load the queue.'));
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
      const res = await kycRepository.queue({ ...query, page: pagination.page + 1 });
      setItems((prev) => [...prev, ...res.data]);
      setPagination(res.pagination);
    } catch {
      // Keep what's on screen.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, pagination, query]);

  return {
    items,
    pagination,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh: () => load('refresh'),
    retry: () => load('initial'),
    loadMore,
  };
}

/** One rider's submission, plus the verify/reject/approve actions. */
export function useKycDetail(userId: string) {
  const [detail, setDetail] = useState<ApiKycDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await kycRepository.detail(userId));
    } catch (err) {
      setError(asApiError(err, 'Could not load this submission.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = useMemo(
    () => ({
      previewUrl: async (documentId: string, side: 'front' | 'back') => {
        try {
          return await kycRepository.reviewDocumentUrl(documentId, side);
        } catch (err) {
          return asApiError(err, 'Preview unavailable.');
        }
      },

      verify: async (documentId: string) => {
        setBusyDocId(documentId);
        try {
          const result = await kycRepository.verifyDocument(documentId);
          await load();
          return result;
        } catch (err) {
          return asApiError(err, 'Could not verify the document.');
        } finally {
          setBusyDocId(null);
        }
      },

      rejectDocument: async (documentId: string, reason: string) => {
        setRejecting(true);
        try {
          const result = await kycRepository.rejectDocument(documentId, reason);
          await load();
          return result;
        } catch (err) {
          return asApiError(err, 'Could not reject the document.');
        } finally {
          setRejecting(false);
        }
      },

      approve: async () => {
        setApproving(true);
        try {
          const result = await kycRepository.approve(userId);
          await load();
          return result;
        } catch (err) {
          return asApiError(err, 'Could not approve.');
        } finally {
          setApproving(false);
        }
      },

      rejectAll: async (reason: string) => {
        setRejecting(true);
        try {
          const result = await kycRepository.reject(userId, reason);
          await load();
          return result;
        } catch (err) {
          return asApiError(err, 'Could not reject.');
        } finally {
          setRejecting(false);
        }
      },
    }),
    [userId, load],
  );

  return { detail, loading, error, busyDocId, approving, rejecting, retry: load, actions };
}

export type { ApiDocument };
