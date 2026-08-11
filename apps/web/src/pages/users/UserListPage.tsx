import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, ShieldCheck, Ban, CheckCircle2, Trash2, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchBar } from "@/components/common/SearchBar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useUsers, useDeleteUser, useChangeUserStatus } from "@/hooks/useUsers";
import { useAuthStore } from "@/store/authStore";
import { initials } from "@/lib/utils";
import type { AppUser, BackendRoleName, KycStatus } from "@/types";

const KYC_OPTIONS: (KycStatus | "all")[] = ["all", "not_submitted", "pending", "partially_verified", "verified", "rejected"];

/** Only "admin" and "rider" have any real accounts today — see types/index.ts. No "All" tab — Rider is the default and first. */
const ROLE_TABS: { value: BackendRoleName; label: string }[] = [
  { value: "rider", label: "Rider" },
  { value: "admin", label: "Admin" },
];

export default function UserListPage() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus | "all">("all");
  const [roleFilter, setRoleFilter] = useState<BackendRoleName>("rider");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AppUser | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError, refetch } = useUsers({ search, kycStatus, role: roleFilter, page, pageSize: 8 });
  const deleteUser = useDeleteUser();
  const changeStatus = useChangeUserStatus();

  const columns: DataTableColumn<AppUser>[] = [
    {
      header: "User",
      key: "name",
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={u.profile_photo_url ?? undefined} alt={u.full_name} />
            <AvatarFallback>{initials(u.full_name || "?")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{u.full_name || "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{u.phone ?? "No phone on file"}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Role",
      key: "role",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.length === 0 ? "—" : u.roles.map((r) => <StatusBadge key={r} status={r} />)}
        </div>
      ),
    },
    { header: "Account", key: "account", render: (u) => <StatusBadge status={u.account_status} /> },
    { header: "KYC", key: "kyc", render: (u) => <StatusBadge status={u.kyc_status} /> },
    {
      header: "Assigned vehicle",
      key: "vehicle",
      render: (u) =>
        u.assigned_vehicle ? (
          <button
            type="button"
            className="truncate font-medium text-primary underline-offset-2 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/vehicles/${u.assigned_vehicle!.id}`);
            }}
          >
            {u.assigned_vehicle.name}
          </button>
        ) : (
          "—"
        ),
      hideOnMobile: true,
    },
    {
      header: "Plan",
      key: "plan",
      render: (u) =>
        u.current_plan ? (
          <div className="min-w-0">
            <p className="truncate font-medium">{u.current_plan.name}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">
              ₹{u.current_plan.price.toFixed(0)} / {u.current_plan.billing_cycle}
            </p>
          </div>
        ) : (
          "—"
        ),
      hideOnMobile: true,
    },
    {
      header: "Payment",
      key: "payment_status",
      render: (u) => (u.payment_status ? <StatusBadge status={u.payment_status} /> : "—"),
      hideOnMobile: true,
    },
    {
      header: "Actions",
      key: "actions",
      render: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/users/${u.id}`)}>
              <Eye className="mr-2 h-4 w-4" /> View profile
            </DropdownMenuItem>
            {u.kyc_status === "pending" && (
              <DropdownMenuItem onClick={() => navigate("/kyc")}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Review KYC
              </DropdownMenuItem>
            )}
            {u.account_status === "suspended" ? (
              <DropdownMenuItem onClick={() => changeStatus.mutate({ id: u.id, action: "activate" })}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Reactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  setSuspendTarget(u);
                  setReason("");
                }}
              >
                <Ban className="mr-2 h-4 w-4" /> Suspend
              </DropdownMenuItem>
            )}
            {role === "admin" && (
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(u)}>
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
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? 0} registered users</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={roleFilter}
          onValueChange={(v) => {
            setRoleFilter(v as BackendRoleName);
            setPage(1);
          }}
        >
          <TabsList className="flex-wrap">
            {ROLE_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchBar
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search by name, email or phone..."
          className="sm:max-w-xs"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={kycStatus}
            onValueChange={(v) => {
              setKycStatus(v as KycStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="KYC status" />
            </SelectTrigger>
            <SelectContent>
              {KYC_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All KYC statuses" : s.replace(/_/g, " ")}
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
          onRowClick={(u) => navigate(`/users/${u.id}`)}
          emptyTitle="No users match your filters"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.full_name}?`}
        description="This soft-deletes the user profile (recoverable via restore)."
        confirmLabel="Delete user"
        destructive
        loading={deleteUser.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteUser.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />

      <Dialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (at least 5 characters)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5 || changeStatus.isPending}
              onClick={() => {
                if (suspendTarget) {
                  changeStatus.mutate(
                    { id: suspendTarget.id, action: "suspend", reason },
                    { onSuccess: () => setSuspendTarget(null) },
                  );
                }
              }}
            >
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
