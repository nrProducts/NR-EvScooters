import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useDamages, useDamage, useResolveDamageDispute } from "@/hooks/useDamages";
import { useTableSort } from "@/hooks/useTableSort";
import { ApiError } from "@/services/api/httpClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Damage, DamageStatus } from "@/types";

const STATUS_OPTIONS: (DamageStatus | "all")[] = ["all", "recorded", "disputed", "resolved"];

export default function DamagesPage() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("bookingId") ?? undefined;
  const [status, setStatus] = useState<DamageStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useDamages({
    status, bookingId, page, pageSize: 8, sortBy: sort.by as "created_at" | "amount", sortDir: sort.dir,
  });

  const columns: DataTableColumn<Damage>[] = [
    { header: "Reported by", key: "reported_by", render: (d) => d.reported_by?.full_name ?? "—" },
    { header: "Amount", key: "amount", sortKey: "amount", render: (d) => formatCurrency(d.amount) },
    { header: "Deposit deduction", key: "deposit_deduction", render: (d) => formatCurrency(d.deposit_deduction), hideOnMobile: true },
    { header: "Outstanding", key: "outstanding_amount", render: (d) => formatCurrency(d.outstanding_amount) },
    { header: "Status", key: "status", render: (d) => <StatusBadge status={d.status} /> },
    { header: "Recorded", key: "created_at", sortKey: "created_at", render: (d) => formatDate(d.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDetailId(d.id)}>
              <Eye className="mr-2 h-4 w-4" /> View details
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/payments?bookingId=${d.booking_id}`} onClick={(e) => e.stopPropagation()}>
                <Eye className="mr-2 h-4 w-4" /> View payment history
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Damage Review</h1>
        <p className="text-sm text-muted-foreground">
          {data?.total ?? 0} damage records
          {bookingId && (
            <>
              {" · filtered to one booking — "}
              <Link to="/damages" className="underline">clear</Link>
            </>
          )}
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as DamageStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={(d) => setDetailId(d.id)}
          emptyTitle="No damage records match your filters"
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <DamageDetailDialog id={detailId} onOpenChange={(o) => !o && setDetailId(null)} />
    </div>
  );
}

function DamageDetailDialog({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const { data: damage, isLoading } = useDamage(id ?? undefined);
  const [notes, setNotes] = useState("");
  const [resolvedAmount, setResolvedAmount] = useState("");
  const resolve = useResolveDamageDispute();

  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setNotes("");
          setResolvedAmount("");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Damage record</DialogTitle>
        </DialogHeader>

        {isLoading || !damage ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Status" value={<StatusBadge status={damage.status} />} />
            <Row label="Amount" value={formatCurrency(damage.amount)} />
            <Row label="Deposit deduction" value={formatCurrency(damage.deposit_deduction)} />
            <Row label="Outstanding (rider owes)" value={formatCurrency(damage.outstanding_amount)} />
            <Row label="Description" value={damage.description} />
            <Row label="Reported by" value={damage.reported_by?.full_name ?? "—"} />
            <Row label="Recorded" value={formatDate(damage.created_at)} />

            {damage.photo_urls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {damage.photo_urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="Damage" className="aspect-square w-full rounded-md object-cover" />
                  </a>
                ))}
              </div>
            )}

            {damage.status === "disputed" && (
              <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <p className="font-medium">Rider dispute</p>
                <Row label="Reason" value={damage.dispute_reason ?? "—"} />
                <Row label="Disputed by" value={damage.disputed_by?.full_name ?? "—"} />

                <div className="space-y-1.5 pt-1">
                  <Label>Adjusted amount (optional — leave blank to uphold ₹{damage.amount})</Label>
                  <Input
                    type="number"
                    min={0}
                    value={resolvedAmount}
                    onChange={(e) => setResolvedAmount(e.target.value)}
                    placeholder={String(damage.amount)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Resolution notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>

                {resolve.isError && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {resolve.error instanceof ApiError ? resolve.error.message : "Something went wrong."}
                  </p>
                )}

                <Button
                  disabled={resolve.isPending || notes.trim().length < 3}
                  onClick={() => {
                    resolve.mutate(
                      {
                        id: damage.id,
                        notes: notes.trim(),
                        resolvedAmount: resolvedAmount ? Number(resolvedAmount) : undefined,
                      },
                      { onSuccess: () => onOpenChange(false) },
                    );
                  }}
                >
                  {resolve.isPending ? "Please wait..." : "Resolve dispute"}
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
