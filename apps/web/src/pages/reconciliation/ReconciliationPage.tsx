import { useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, FileWarning, Landmark } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { useReconciliation } from "@/hooks/useReconciliation";
import { formatCurrency, formatDate } from "@/lib/utils";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ReconciliationPage() {
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const { data, isLoading, isError, refetch } = useReconciliation(from, to);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Compares our payment ledger against Razorpay's own records for the selected date range.
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-44" />
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : !data ? null : data.gatewayUnavailable ? (
            <div className="rounded-md bg-warning/10 px-4 py-3 text-sm text-warning">
              Payment gateway isn't configured — showing internal figures only. Add Razorpay keys to compare against
              gateway records.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Internal payments" value={data.internalPaymentCount} icon={CreditCard} />
                <StatCard label="Gateway payments" value={data.gatewayPaymentCount} icon={Landmark} />
                <StatCard
                  label="Unmatched internal"
                  value={data.unmatchedInternal.length}
                  icon={AlertTriangle}
                  tone={data.unmatchedInternal.length > 0 ? "destructive" : "success"}
                />
                <StatCard
                  label="Missing internal"
                  value={data.missingInternal.length}
                  icon={FileWarning}
                  tone={data.missingInternal.length > 0 ? "destructive" : "success"}
                />
              </div>

              {data.unmatchedInternal.length === 0 && data.missingInternal.length === 0 && data.failedWebhooks.length === 0 ? (
                <div className="mt-6 flex items-center gap-2 rounded-md bg-success/10 px-4 py-3 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> Everything reconciles for this range.
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  {data.unmatchedInternal.length > 0 && (
                    <Section title="Unmatched internal payments" subtitle="In our ledger but not found at the gateway — investigate immediately.">
                      <Table
                        rows={data.unmatchedInternal}
                        columns={[
                          { header: "Gateway payment ID", render: (r) => r.gatewayPaymentId },
                          { header: "Amount", render: (r) => formatCurrency(r.amount) },
                          { header: "Applied", render: (r) => formatDate(r.appliedAt) },
                        ]}
                      />
                    </Section>
                  )}

                  {data.missingInternal.length > 0 && (
                    <Section title="Missing internal payments" subtitle="Captured at the gateway but never recorded here — usually a missed or failed webhook.">
                      <Table
                        rows={data.missingInternal}
                        columns={[
                          { header: "Gateway payment ID", render: (r) => r.gatewayPaymentId },
                          { header: "Amount", render: (r) => formatCurrency(r.amount) },
                          { header: "Status", render: (r) => r.status },
                          { header: "Created", render: (r) => formatDate(r.createdAt) },
                        ]}
                      />
                    </Section>
                  )}

                  {data.failedWebhooks.length > 0 && (
                    <Section title="Failed webhook deliveries" subtitle="Signature-invalid or never-processed events in this range.">
                      <Table
                        rows={data.failedWebhooks}
                        columns={[
                          { header: "Event type", render: (r) => r.eventType },
                          { header: "Signature valid", render: (r) => (r.signatureValid ? "Yes" : "No") },
                          { header: "Processed", render: (r) => (r.processed ? "Yes" : "No") },
                          { header: "Error", render: (r) => r.error ?? "—" },
                          { header: "Received", render: (r) => formatDate(r.receivedAt) },
                        ]}
                      />
                    </Section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

function Table<T>({ rows, columns }: { rows: T[]; columns: { header: string; render: (row: T) => React.ReactNode }[] }) {
  if (rows.length === 0) return <EmptyState title="Nothing here" />;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {columns.map((c) => (
              <th key={c.header} className="px-3 py-2 text-left font-medium text-muted-foreground">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((c) => (
                <td key={c.header} className="px-3 py-2">{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
