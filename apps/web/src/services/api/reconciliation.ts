import { apiClient } from "./httpClient";

export interface UnmatchedInternalPayment {
  gatewayPaymentId: string;
  amount: number;
  appliedAt: string;
}

export interface MissingGatewayPayment {
  gatewayPaymentId: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface FailedWebhookEvent {
  id: string;
  eventType: string;
  signatureValid: boolean;
  processed: boolean;
  error: string | null;
  receivedAt: string;
}

export interface ReconciliationReport {
  range: { from: string; to: string };
  internalPaymentCount: number;
  gatewayPaymentCount: number;
  unmatchedInternal: UnmatchedInternalPayment[];
  missingInternal: MissingGatewayPayment[];
  failedWebhooks: FailedWebhookEvent[];
  gatewayUnavailable: boolean;
}

/** GET /reconciliation — requireAdmin. See apps/backend/src/modules/reconciliation/reconciliation.routes.ts */
export async function fetchReconciliation(from: string, to: string): Promise<ReconciliationReport> {
  return apiClient.get<ReconciliationReport>("/reconciliation", { from, to });
}
