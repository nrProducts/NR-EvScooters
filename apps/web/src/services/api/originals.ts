import { apiClient } from "./httpClient";

/** Mirrors apps/backend/src/modules/originals. */
export type OriginalDocType = "driving_licence" | "voter_id" | "marksheet" | "other";

export const ORIGINAL_DOC_OPTIONS: { type: Exclude<OriginalDocType, "other">; label: string }[] = [
  { type: "driving_licence", label: "Driving licence" },
  { type: "voter_id", label: "Voter ID" },
  { type: "marksheet", label: "Marksheet" },
];

/** What the pickup records: nothing taken, or the list of what was. */
export type OriginalsInput =
  | { none: true }
  | { documents: { type: OriginalDocType; other_label?: string }[] };

export interface OriginalDocumentView {
  id: string;
  doc_type: OriginalDocType;
  /** Ready to show: "Driving licence", or the text typed for "other". */
  label: string;
  status: "held" | "returned";
  received_at: string;
  received_by: { id: string; full_name: string } | null;
  returned_at: string | null;
}

export interface RentalOriginalsView {
  rental_id: string;
  taken: boolean;
  recorded_at: string;
  recorded_by: { id: string; full_name: string } | null;
  documents: OriginalDocumentView[];
}

/** GET /originals/rentals/:id — the pickup record for one rental; `originals` is null for rentals from before this was recorded. */
export async function fetchRentalOriginals(rentalId: string): Promise<{ originals: RentalOriginalsView | null }> {
  return apiClient.get<{ originals: RentalOriginalsView | null }>(`/originals/rentals/${rentalId}`);
}

/** GET /originals/users/:id — every pickup record for a rider, newest first. */
export async function fetchRiderOriginals(userId: string): Promise<RentalOriginalsView[]> {
  return apiClient.get<RentalOriginalsView[]>(`/originals/users/${userId}`);
}
