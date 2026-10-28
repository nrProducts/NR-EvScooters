import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useErrorLogs } from "@/hooks/useErrorLogs";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatDateTime } from "@/lib/utils";
import type { ErrorLogClient, ErrorLogEntry } from "@/types";

const CLIENTS: { value: ErrorLogClient | "all"; label: string }[] = [
  { value: "all", label: "Any client" },
  { value: "mobile", label: "Mobile app" },
  { value: "web", label: "Admin web" },
  { value: "website", label: "Website" },
  { value: "unknown", label: "Unknown" },
];

/**
 * Every failed API call (4xx/5xx), across all three clients, from one admin
 * screen — written by errorHandler (apps/backend/src/middleware/error
 * .middleware.ts) the moment any request fails, so there's somewhere to look
 * that doesn't depend on a client-side crash reaching Sentry (it never will
 * for a HANDLED error — a declined payment, a conflict, a validation
 * failure — only for an unhandled JS exception) or on grepping Render logs
 * by hand.
 *
 * 10 days only — this is a debugging aid, not a retained record. A daily
 * cron purges anything older (see the migration); there is nothing to
 * configure here for that.
 */
export default function ErrorLogsPage() {
  const [client, setClient] = useState<ErrorLogClient | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useErrorLogs({
    client: client === "all" ? undefined : client,
    search: search.trim() || undefined,
    page,
    pageSize: 20,
  });

  const columns: DataTableColumn<ErrorLogEntry>[] = [
    {
      key: "occurred_at",
      header: "When",
      render: (row) => (
        <span className="whitespace-nowrap text-xs">{formatDateTime(row.occurred_at)}</span>
      ),
    },
    {
      key: "client",
      header: "Client",
      render: (row) => <StatusBadge status={row.client} />,
    },
    {
      key: "request",
      header: "Request",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium">
            {row.method} <span className="break-all">{row.path}</span>
          </p>
          {row.error_code && <p className="text-xs text-muted-foreground">{row.error_code}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className={
            row.status_code >= 500
              ? "font-mono text-xs font-semibold text-destructive"
              : "font-mono text-xs font-semibold text-warning"
          }
        >
          {row.status_code}
        </span>
      ),
    },
    {
      key: "message",
      header: "Message",
      hideOnMobile: true,
      render: (row) => <MessageCell row={row} />,
    },
    {
      key: "user",
      header: "Rider/staff",
      render: (row) => <span className="text-sm">{row.user?.full_name ?? "—"}</span>,
    },
  ];

  usePageSubtitle(
    <>
      Every failed API call (4xx/5xx) from the rider app, this console, and the marketing website.
      Kept 10 days, then purged automatically — this is a debugging aid, not a retained record.
    </>,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <Card className="flex min-h-[20rem] flex-1 flex-col overflow-hidden">
        <FilterBar
          search={
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search path, method, code or message"
              className="w-full sm:w-72"
            />
          }
          filters={
            <Select value={client} onValueChange={(v) => { setClient(v as ErrorLogClient | "all"); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Any client" /></SelectTrigger>
              <SelectContent>
                {CLIENTS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <DataTable
            fill
            data={data?.data ?? []}
            columns={columns}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle="No errors in the last 10 days"
            emptyDescription="Nothing matches these filters."
          />
        </CardContent>
        {data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}

/** The message, and the stack trace behind it when there is one — only unhandled (500) errors carry a stack. */
function MessageCell({ row }: { row: ErrorLogEntry }) {
  if (!row.message) return <span className="text-xs text-muted-foreground">—</span>;
  if (!row.stack) {
    return <p className="max-w-md truncate text-xs text-muted-foreground" title={row.message}>{row.message}</p>;
  }
  return (
    <details className="min-w-0 max-w-md">
      <summary className="cursor-pointer truncate text-xs text-muted-foreground">{row.message}</summary>
      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">{row.stack}</pre>
    </details>
  );
}
