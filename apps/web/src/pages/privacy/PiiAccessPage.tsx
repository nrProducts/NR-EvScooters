import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { usePiiAccess } from "@/hooks/usePiiAccess";
import { formatDateTime } from "@/lib/utils";
import { PII_ACCESS_REASON_LABELS, type PiiAccessEntry, type PiiAccessReason } from "@/types";

const RESOURCE_LABELS: Record<string, string> = {
  kyc_document_image: "ID document image",
  kyc_detail: "KYC detail view",
  user_profile: "Rider profile",
  profile_photo: "Rider photo",
  data_export: "Data export",
  consent_history: "Consent history",
};

const REASON_LABELS: Record<PiiAccessReason, string> = {
  ...PII_ACCESS_REASON_LABELS,
  rider_self: "Rider viewing their own data",
};

/**
 * Every read of a rider's personal data by a member of staff.
 *
 * This is the accountability artefact for the highest-risk thing the console
 * does: opening someone's Aadhaar or driving-licence scan. Before it existed,
 * that action left no trace at all.
 *
 * Deliberately admin-only, and deliberately not filterable by free text —
 * a search box over this table would itself become a way to browse who has
 * been looked at.
 */
export default function PiiAccessPage() {
  const [reason, setReason] = useState<PiiAccessReason | "all">("all");
  const [resource, setResource] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = usePiiAccess({
    reason,
    resource: resource === "all" ? undefined : resource,
    page,
    pageSize: 20,
  });

  const columns: DataTableColumn<PiiAccessEntry>[] = [
    {
      key: "created_at",
      header: "When",
      render: (row) => (
        <span className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: "actor",
      header: "Who looked",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.actor?.full_name ?? "Deleted account"}</p>
          <p className="truncate text-xs text-muted-foreground">{row.actor_role || "—"}</p>
        </div>
      ),
    },
    {
      key: "target_user",
      header: "Whose data",
      render: (row) => (
        <span className="text-sm">{row.target_user?.full_name ?? "Erased account"}</span>
      ),
    },
    {
      key: "resource",
      header: "What",
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm">{RESOURCE_LABELS[row.resource] ?? row.resource}</p>
          {row.fields && row.fields.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">{row.fields.join(", ")}</p>
          )}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Why",
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm">{REASON_LABELS[row.reason] ?? row.reason}</p>
          {row.context_ref && (
            <p className="truncate text-xs text-muted-foreground">{row.context_ref}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PII access log</h1>
        <p className="text-sm text-muted-foreground">
          Every time a member of staff opened a rider's personal data. Append-only — entries
          cannot be edited or deleted, including by us. Riders can see their own entries in the app.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={reason} onValueChange={(v) => { setReason(v as PiiAccessReason | "all"); setPage(1); }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Any reason" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any reason</SelectItem>
            {Object.entries(REASON_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={resource} onValueChange={(v) => { setResource(v); setPage(1); }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Any data" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any data</SelectItem>
            {Object.entries(RESOURCE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
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
            emptyTitle="No access recorded"
            emptyDescription="Nobody has opened a rider's personal data under these filters."
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
