import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, ShieldCheck, Ban, Trash2, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchBar } from "@/components/common/SearchBar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useRiders, useDeleteRider, useSuspendRider } from "@/hooks/useRiders";
import { useAuthStore } from "@/store/authStore";
import { initials } from "@/lib/utils";
import type { KycStatus, Rider } from "@/types";

const KYC_OPTIONS: (KycStatus | "all")[] = ["all", "pending", "approved", "rejected"];

export default function RiderListPage() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Rider | null>(null);

  const { data, isLoading, isError, refetch } = useRiders({ search, kycStatus, page, pageSize: 8 });
  const deleteRider = useDeleteRider();
  const suspendRider = useSuspendRider();

  const columns: DataTableColumn<Rider>[] = [
    {
      header: "Rider",
      key: "name",
      render: (r) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={r.avatarUrl} alt={r.name} />
            <AvatarFallback>{initials(r.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.phone}</p>
          </div>
        </div>
      ),
    },
    { header: "KYC", key: "kyc", render: (r) => <StatusBadge status={r.kycStatus} /> },
    { header: "Total rides", key: "rides", render: (r) => r.totalRides, hideOnMobile: true },
    { header: "Wallet", key: "wallet", render: (r) => `₹${r.walletBalance}`, hideOnMobile: true },
    {
      header: "Violations",
      key: "violations",
      render: (r) => (r.violations > 0 ? <StatusBadge status="high" /> : "—"),
      hideOnMobile: true,
    },
    {
      header: "Actions",
      key: "actions",
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/riders/${r.id}`)}>
              <Eye className="mr-2 h-4 w-4" /> View profile
            </DropdownMenuItem>
            {r.kycStatus === "pending" && (
              <DropdownMenuItem onClick={() => navigate("/kyc")}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Review KYC
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => suspendRider.mutate(r.id)}>
              <Ban className="mr-2 h-4 w-4" /> Suspend
            </DropdownMenuItem>
            {role === "admin" && (
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(r)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Riders</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? 0} registered riders</p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or phone..."
            className="sm:max-w-xs"
          />
          <Select
            value={kycStatus}
            onValueChange={(v) => {
              setKycStatus(v as KycStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="KYC status" />
            </SelectTrigger>
            <SelectContent>
              {KYC_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All KYC statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
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
          onRowClick={(r) => navigate(`/riders/${r.id}`)}
          emptyTitle="No riders match your filters"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        description="This permanently removes the rider profile and their history."
        confirmLabel="Delete rider"
        destructive
        loading={deleteRider.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteRider.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </div>
  );
}
