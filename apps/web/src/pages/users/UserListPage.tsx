import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, ShieldCheck, Ban, CheckCircle2, Trash2, MoreHorizontal, UserCog, UserMinus, KeyRound,
} from "lucide-react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  useUsers, useDeleteUser, useChangeUserStatus, useChangeUserRole,
} from "@/hooks/useUsers";
import { useTableSort } from "@/hooks/useTableSort";
import { useAuthStore } from "@/store/authStore";
import { initials, formatDate } from "@/lib/utils";
import type { AppUser, BackendRoleName, KycStatus } from "@/types";

const KYC_OPTIONS: (KycStatus | "all")[] = ["all", "not_submitted", "pending", "partially_verified", "verified", "rejected"];

/** "staff" joined "rider"/"admin" as a real, grantable role — see supabase/migrations/20260813*. */
const ROLE_TABS: { value: BackendRoleName; label: string }[] = [
  { value: "rider", label: "Rider" },
  { value: "staff", label: "Staff" },
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
  const [roleError, setRoleError] = useState<string | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useUsers({
    search, kycStatus, role: roleFilter, page, pageSize: 8,
    sortBy: sort.by as "full_name" | "created_at" | "kyc_status", sortDir: sort.dir,
  });
  const deleteUser = useDeleteUser();
  const changeStatus = useChangeUserStatus();
  const changeRole = useChangeUserRole();

  // Admin can never edit their own roles (backend refuses it outright — see
  // users.service.ts replaceRoles) — hide the actions rather than let
  // someone click into a guaranteed error.
  const currentUserId = useAuthStore((s) => s.user?.id);

  // next_due_at is the current period's due_on — a value <= today means due
  // today or already overdue, regardless of whether the overdue sweep has
  // flipped the subscription to 'past_due' yet (it only runs the day after).
  // 'paused'/pre-pickup states are excluded: nothing is actively due on those.
  const isDueOrOverdue = (u: AppUser) =>
    !!u.next_due_at
    && u.next_due_at <= new Date().toISOString().slice(0, 10)
    && (u.payment_status === "active" || u.payment_status === "past_due");

  // A demotion to `rider`, not the removal of one entry from a role array:
  // `users.role` holds exactly one value.
  const revokeStaff = (u: AppUser) => {
    setRoleError(null);
    changeRole.mutate(
      { id: u.id, role: "rider" },
      { onError: (err) => setRoleError(err instanceof Error ? err.message : "Could not revoke staff access.") },
    );
  };

  const columns: DataTableColumn<AppUser>[] = [
    {
      header: "User",
      key: "name",
      sortKey: "full_name",
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
      render: (u) => <StatusBadge status={u.role} />,
    },
    { header: "Account", key: "account", render: (u) => <StatusBadge status={u.account_status} /> },
    { header: "KYC", key: "kyc", sortKey: "kyc_status", render: (u) => <StatusBadge status={u.kyc_status} /> },
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
      header: "Plan Started",
      key: "plan_started_at",
      render: (u) => (u.plan_started_at ? formatDate(u.plan_started_at) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Plan Ends",
      key: "next_due_at",
      render: (u) => (u.next_due_at ? formatDate(u.next_due_at) : "—"),
      hideOnMobile: true,
    },
    { header: "Joined", key: "created_at", sortKey: "created_at", render: (u) => formatDate(u.created_at), hideOnMobile: true },
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
          {/*
            onClick here (not just on the trigger) matters: DropdownMenuContent
            renders in a portal, but React re-parents portalled content into the
            React *tree* for event bubbling purposes — a click on any item still
            bubbles up to this row's onRowClick unless stopped here. Without it,
            every action in this menu (Manage permissions, Suspend, Revoke,
            Delete) fires correctly and then gets silently overridden a tick
            later by the row navigating to the profile page.
          */}
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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
            ) : u.account_status === "inactive" ? (
              <DropdownMenuItem onClick={() => changeStatus.mutate({ id: u.id, action: "activate" })}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Activate account
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
            {role === "admin" && u.id !== currentUserId && (
              <>
                {u.role === "staff" ? (
                  <>
                    <DropdownMenuItem onClick={() => navigate(`/settings/staff-access/${u.id}/permissions`)}>
                      <KeyRound className="mr-2 h-4 w-4" /> Manage permissions
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => revokeStaff(u)}>
                      <UserMinus className="mr-2 h-4 w-4" /> Revoke staff access
                    </DropdownMenuItem>
                  </>
                ) : (
                  // Do not allow converting a Rider into Staff from here.
                  // Staff must be created/invited by an Admin from Settings → Staff Access.
                  null
                )}
              </>
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

      {roleError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {roleError}
        </div>
      )}

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
          sort={sort}
          onSortChange={onSortChange}
          rowClassName={(u) => (isDueOrOverdue(u) ? "border-l-4 border-l-destructive" : undefined)}
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
