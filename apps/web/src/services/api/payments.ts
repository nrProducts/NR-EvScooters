import { MOCK_TRANSACTIONS } from "@/services/mockData";
import type { PaymentStatus } from "@/types";
import { delay, paginate } from "./client";

const transactions = [...MOCK_TRANSACTIONS];

export interface PaymentFilters {
  status?: PaymentStatus | "all";
  page?: number;
  pageSize?: number;
}

export async function fetchTransactions(filters: PaymentFilters = {}) {
  const { status = "all", page = 1, pageSize = 10 } = filters;
  const result = status === "all" ? transactions : transactions.filter((t) => t.status === status);
  return delay(paginate(result, page, pageSize));
}

export async function issueRefund(id: string) {
  const txn = transactions.find((t) => t.id === id);
  return delay({ success: true, txn });
}
