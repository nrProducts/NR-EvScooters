import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Eye, ShieldCheck, Ban, CheckCircle2, Trash2, UserMinus, KeyRound, UserCheck, Bike, XCircle,
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
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { RowActionsButton } from "@/components/ui/row-actions-button";
import {
  useUsers, useDeleteUser, useChangeUserStatus, useChangeUserRole,
  useApproveSignup, useRejectSignup,
} from "@/hooks/useUsers";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { useAuthStore } from "@/store/authStore";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { initials, formatDate, formatCurrency } from "@/lib/utils";
import type { AppUser, BackendRoleName, KycStatus } from "@/types";

const KYC_OPTIONS: (KycStatus | "all")[] = ["all", "not_submitted", "pending", "partially_verified", "verified", "rejected"];

/** The role tabs plus a cross-role queue of self-registered accounts awaiting approval. */
type UserTab = BackendRoleName | "pending";
const USER_TABS: { value: UserTab; label: string }[] = [
  { value: "rider", label: "Rider" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Admin" },
  { value: "pending", label: "Awaiting approval" },
];

export default function UserListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const initialTab = ((): UserTab => {
    const t = searchParams.get("tab");
    return t === "pending" && role === "admin" ? "pending" : "rider";
  })();
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus | "all">("all");
  const [tab, setTab] = useState<UserTab>(initialTab);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AppUser | null>(null);
  const isPendingTab = tab === "pending";
  const [suspendTarget, setSuspendTarget] = useState<AppUser | null>(null);
  const [reason, setReason] = useState("");
  const [roleError, setRoleError] = useState<string | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useUsers({
    search,
    kycStatus: isPendingTab ? "all" : kycStatus,
    role: isPendingTab ? "all" : tab,
    pendingApproval: isPendingTab,
    page, pageSize: 8,
    sortBy: sort.by as "full_name" | "created_at" | "kyc_status", sortDir: sort.dir,
  });
  const deleteUser = useDeleteUser();
  const changeStatus = useChangeUserStatus();
  const changeRole = useChangeUserRole();
  const approveSignup = useApproveSignup();
  const rejectSignup = useRejectSignup();

  const approve = (u: AppUser, role: "staff" | "rider") => {
    setRoleError(null);
    approveSignup.mutate(
      { id: u.id, role },
      {
        onSuccess: () => toastSuccess(`${u.full_name || "Account"} approved as ${role}`),
        onError: (err) => toastError(err, "Could not approve this account"),
      },
    );
  };

  // Admin can never edit their own roles (backend refuses it outright — see
  // users.service.ts replaceRoles) — hide the actions rather than let
  // someone click into a guaranteed error.
  const currentUserId = useAuthStore((s) => s.user?.id);

  // The rider genuinely owes money right now — a real unpaid invoice balance,
  // not a guess from a plan's due date. Stays false for a rider whose plan
  // has ended and whose bills (including any return settlement) are all paid,
  // even while the completed rental's records still exist.
  const isDueOrOverdue = (u: AppUser) => u.outstanding_amount > 0;

  // A demotion to `rider`, not the removal of one entry from a role array:
  // `users.role` holds exactly one value.
  const revokeStaff = (u: AppUser) => {
    setRoleError(null);
    changeRole.mutate(
      { id: u.id, role: "rider" },
      {
        onSuccess: () => toastSuccess("Staff access revoked"),
        onError: (err) => {
          setRoleError(err instanceof Error ? err.message : "Could not revoke staff access.");
          toastError(err, "Could not revoke staff access");
        },
      },
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
      // An open return SUPERSEDES the plan status, exactly as it does in
      // BookingListPage's merged status column. `subscriptions.status` stays
      // "active" all the way through a return by design — the rental must not
      // end until staff confirm the handover — so rendering it alone showed a
      // rider who had asked to give the scooter back as an ordinary paying
      // customer, with nothing on the row to say staff owed them an action.
      //
      // The plan status is kept as sub-text rather than dropped: it is still
      // the answer to "is this rider also behind on money", which the return
      // does not settle either way.
      render: (u) => (u.open_return ? (
        <div className="min-w-0">
          <StatusBadge status={u.open_return.status === "inspected" ? "inspected" : "return_requested"} />
          {u.payment_status ? (
            <p className="mt-1 truncate text-xs capitalize text-muted-foreground">
              Plan: {u.payment_status.replace(/_/g, " ")}
            </p>
          ) : null}
        </div>
      ) : u.payment_status ? (
        <StatusBadge status={u.payment_status} />
      ) : (
        "—"
      )),
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
      // Muted during a return: the date is a RENEWAL date, and nothing is
      // going to renew on a scooter being handed back. Kept visible rather
      // than blanked — staff still need to know which period the rider is
      // being returned out of — but it must not read as an upcoming event.
      render: (u) => (u.next_due_at ? (
        <span className={u.open_return ? "text-muted-foreground line-through" : undefined}>
          {formatDate(u.next_due_at)}
        </span>
      ) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Outstanding",
      key: "outstanding_amount",
      render: (u) => (u.outstanding_amount > 0
        ? <span className="font-semibold text-destructive">{formatCurrency(u.outstanding_amount)}</span>
        : <span className="text-muted-foreground">₹0</span>),
    },
    { header: "Joined", key: "created_at", sortKey: "created_at", render: (u) => formatDate(u.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (u) =>
        isPendingTab ? (
          <DropdownMenu>
            <RowActionsButton label="Approval actions" onClick={(e) => e.stopPropagation()} />
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => navigate(`/users/${u.id}`)}>
                <Eye className="mr-2 h-4 w-4" /> View profile
              </DropdownMenuItem>
              <DropdownMenuItem disabled={approveSignup.isPending} onClick={() => approve(u, "rider")}>
                <Bike className="mr-2 h-4 w-4" /> Approve as rider
              </DropdownMenuItem>
              <DropdownMenuItem disabled={approveSignup.isPending} onClick={() => approve(u, "staff")}>
                <UserCheck className="mr-2 h-4 w-4" /> Approve as staff
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setRejectTarget(u)}>
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
        <DropdownMenu>
          <RowActionsButton label="Rider actions" onClick={(e) => e.stopPropagation()} />
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
              <DropdownMenuItem
                onClick={() =>
                  changeStatus.mutate(
                    { id: u.id, action: "activate" },
                    {
                      onSuccess: () => toastSuccess("Account reactivated"),
                      onError: (err) => toastError(err, "Could not reactivate account"),
                    },
                  )
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Reactivate
              </DropdownMenuItem>
            ) : u.account_status === "inactive" ? (
              <DropdownMenuItem
                onClick={() =>
                  changeStatus.mutate(
                    { id: u.id, action: "activate" },
                    {
                      onSuccess: () => toastSuccess("Account activated"),
                      onError: (err) => toastError(err, "Could not activate account"),
                    },
                  )
                }
              >
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

  usePageSubtitle(
    isPendingTab
      ? `${data?.total ?? 0} account${(data?.total ?? 0) === 1 ? "" : "s"} awaiting approval`
      : `${data?.total ?? 0} registered users`,
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {roleError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {roleError}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = v as UserTab;
            setTab(next);
            setPage(1);
            setSearchParams(
              (prev) => {
                if (next === "pending") prev.set("tab", "pending");
                else prev.delete("tab");
                return prev;
              },
              { replace: true },
            );
          }}
        >
          <TabsList className="flex-wrap">
            {USER_TABS.filter((t) => t.value !== "pending" || role === "admin").map((t) => (
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
          placeholder="Search name, email or phone…"
          className="sm:max-w-xs"
        />
      </div>

      <Card>
        {isPendingTab ? (
          <div className="border-b border-border p-4 text-sm text-muted-foreground">
            Self-registered accounts awaiting review. Approve as staff or rider, or reject to remove the request.
          </div>
        ) : (
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
        )}

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={(u) => navigate(`/users/${u.id}`)}
          emptyTitle={isPendingTab ? "No accounts awaiting approval" : "No users match your filters"}
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
          if (deleteTarget) {
            deleteUser.mutate(deleteTarget.id, {
              onSuccess: () => {
                toastSuccess("User deleted");
                setDeleteTarget(null);
              },
              onError: (err) => toastError(err, "Could not delete user"),
            });
          }
        }}
      />

      <ConfirmDialog
        open={!!rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title={`Reject ${rejectTarget?.full_name || "this registration"}?`}
        description="The account is removed (soft-deleted). They can register again later."
        confirmLabel="Reject"
        destructive
        loading={rejectSignup.isPending}
        onConfirm={() => {
          if (rejectTarget) {
            rejectSignup.mutate(rejectTarget.id, {
              onSuccess: () => {
                toastSuccess("Registration rejected");
                setRejectTarget(null);
              },
              onError: (err) => toastError(err, "Could not reject this account"),
            });
          }
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
                    {
                      onSuccess: () => {
                        toastSuccess("User suspended");
                        setSuspendTarget(null);
                      },
                      onError: (err) => toastError(err, "Could not suspend user"),
                    },
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
