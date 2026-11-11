import { apiClient } from "./httpClient";
import { saveBlob } from "./gst";

/** Mirrors apps/backend/src/modules/books/books.service.ts. Read-only — books.view. */
export type LedgerGroup =
  | "Bank Accounts" | "Cash-in-Hand" | "Current Assets" | "Fixed Assets" | "Duties & Taxes"
  | "Current Liabilities" | "Sundry Creditors" | "Capital Account" | "Loans (Liability)"
  | "Direct Incomes" | "Indirect Incomes" | "Direct Expenses" | "Indirect Expenses" | "Suspense A/c";

export interface TrialBalanceRow { ledger: string; group: LedgerGroup; opening: number; debit: number; credit: number; closing: number }

export interface TrialBalance {
  from: string;
  to: string;
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number };
  unbalancedVouchers: number;
}

export interface ProfitAndLoss {
  from: string;
  to: string;
  income: { ledger: string; group: LedgerGroup; amount: number }[];
  expenses: { ledger: string; group: LedgerGroup; amount: number }[];
  totalIncome: number;
  totalExpenses: number;
  profit: number;
}

export interface DepositRegister {
  rows: { depositId: string; riderName: string | null; amount: number; status: string; heldAt: string | null; refundEligibleOn: string | null }[];
  heldTotal: number;
  ledgerBalance: number;
  difference: number;
}

export interface Receivable { invoiceId: string; riderName: string | null; billNumber: string; dueOn: string | null; balance: number; overdueDays: number }

export interface AdvanceTax {
  fy: string;
  profitSoFar: number;
  monthsElapsed: number;
  projectedProfit: number;
  estimatedTax: number;
  paid: number;
  instalments: { dueOn: string; cumulativePercent: number; cumulativeDue: number }[];
}

export interface UnbalancedVoucher { voucherKey: string; postingDate: string; debits: number; credits: number }

export const fetchTrialBalance = (from: string, to: string) => apiClient.get<TrialBalance>("/books/trial-balance", { from, to });
export const fetchProfitAndLoss = (from: string, to: string) => apiClient.get<ProfitAndLoss>("/books/profit-and-loss", { from, to });
export const fetchDepositRegister = () => apiClient.get<DepositRegister>("/books/deposits");
export const fetchReceivables = () => apiClient.get<Receivable[]>("/books/receivables");
export const fetchAdvanceTax = () => apiClient.get<AdvanceTax>("/books/advance-tax");
export const fetchUnbalanced = () => apiClient.get<UnbalancedVoucher[]>("/books/unbalanced");
export const downloadTallyXml = (from: string, to: string) => saveBlob("/books/export/tally.xml", { from, to });
export const downloadBooksXlsx = (from: string, to: string) => saveBlob("/books/export/books.xlsx", { from, to });
