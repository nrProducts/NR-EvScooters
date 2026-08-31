import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { useAuditLogs } from "@/hooks/useAudit";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatDateTime } from "@/lib/utils";
import type { AuditLogEntry } from "@/types";

/**
 * Entity types worth filtering by. Not exhaustive — the free-text action
 * filter covers the rest — but these are the ones an investigation starts from.
 */
const ENTITY_TYPES = [
  "user", "user_document", "user_role", "user_capability",
  "consent_record", "consent_notice", "privacy_request",
  "booking", "vehicle", "invoice", "payment_order", "deposit", "refund", "damage",
];

/**
 * The full audit trail.
 *
 * The read API has existed since the auth work but only ever surfaced as a
 * six-row widget on the admin dashboard, which is not something you can
 * investigate anything with. Promoting it to a page is close to free and it is
 * the first artefact anyone auditing this system asks to see.
 *
 * Payloads are redacted at write time by safeAuditPayload — names, phones,
 * addresses and dates of birth appear as "[redacted]". The key is kept so the
 * diff still proves which field changed. That is deliberate: audit_logs is
 * retained for years and sits outside the erasure path, so it must never
 * become a second copy of the rider database.
 */
export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useAuditLogs({
    action: action.trim() || undefined,
    entityType: entityType === "all" ? undefined : entityType,
    page,
    pageSize: 20,
  });

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      key: "created_at",
      header: "When",
      render: (row) => (
        <span className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium">{row.action}</p>
          <p className="text-xs text-muted-foreground">{row.entity_type}</p>
        </div>
      ),
    },
    {
      key: "actor",
      header: "Who",
      render: (row) => (
        <span className="text-sm">{row.actor?.full_name ?? "System"}</span>
      ),
    },
    {
      key: "target_user",
      header: "About",
      render: (row) => (
        <span className="text-sm">{row.target_user?.full_name ?? "—"}</span>
      ),
    },
    {
      key: "change",
      header: "Change",
      hideOnMobile: true,
      render: (row) => <ChangeSummary before={row.before_data} after={row.after_data} />,
    },
  ];

  usePageSubtitle(
    <>
      Every recorded change, append-only — entries cannot be edited or deleted, including by us.
      Personal data in the payloads is redacted at write time; the field names remain so a change
      is still provable. For who <em>read</em> a rider's data, see the PII access log.
    </>,
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap gap-2">
        <Input
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          placeholder="Filter by action"
          className="w-64"
        />
        <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1); }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Any entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any entity</SelectItem>
            {ENTITY_TYPES.map((value) => (
              <SelectItem key={value} value={value}>{value.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={data?.data ?? []}
            columns={columns}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle="No entries"
            emptyDescription="Nothing matches these filters."
          />
        </CardContent>
      </Card>

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

/**
 * Field names that changed, not values.
 *
 * Values are mostly "[redacted]" by design, so printing them would be noise;
 * what a reader needs is which field an actor touched, and the full payload is
 * one expand away.
 */
function ChangeSummary({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <details className="min-w-0">
      <summary className="cursor-pointer truncate text-xs text-muted-foreground">
        {keys.slice(0, 3).join(", ")}
        {keys.length > 3 ? ` +${keys.length - 3}` : ""}
      </summary>
      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
        {JSON.stringify({ before, after }, null, 2)}
      </pre>
    </details>
  );
}
