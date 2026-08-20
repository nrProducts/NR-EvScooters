import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, KeyRound, UserMinus, Ban, CheckCircle2, RefreshCw, UserPlus, MoreHorizontal, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  useUsers, useUserPermissions, useChangeUserStatus, useChangeUserRole, useUpdateUserPermissions,
} from "@/hooks/useUsers";
import { initials, formatDate } from "@/lib/utils";
import type { AppUser } from "@/types";
import { matchProfileName, usePermissionCatalog } from "@/hooks/usePermissionCatalog";
import { CUSTOM_PROFILE } from "@/types";
import AddStaffDialog from "./AddStaffDialog";

export default function StaffAccessSection() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<AppUser | null>(null);

  const { data, isLoading, isError, refetch } = useUsers({ role: "staff", page, pageSize: 12 });
  const changeStatus = useChangeUserStatus();
  const changeRole = useChangeUserRole();
  const updatePermissions = useUpdateUserPermissions();

  // Revoking staff access is a demotion to `rider` now, not the removal of
  // one entry from a role array — `users.role` holds exactly one value.
  const revokeStaff = (u: AppUser) => {
    changeRole.mutate({ id: u.id, role: "rider" });
  };

  const resetPermissions = (u: AppUser) => {
    updatePermissions.mutate({ id: u.id, modules: [] });
  };

  const columns: DataTableColumn<AppUser>[] = [
    { header: "Staff", key: "name", render: (u) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8"><AvatarFallback>{initials(u.full_name || "?")}</AvatarFallback></Avatar>
        <div>
          <p className="font-medium">{u.full_name || "—"}</p>
          <p className="text-xs text-muted-foreground">{u.staff_code ?? "No staff ID"}</p>
        </div>
      </div>
    ) },
    { header: "Email / Phone", key: "contact", render: (u) => (
      <div>
        <p className="text-sm">{u.email ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{u.phone ?? "—"}</p>
      </div>
    ) },
    { header: "Status", key: "status", render: (u) => <StatusBadge status={u.account_status} /> },
    { header: "Profile", key: "profile", render: (u) => <ProfileBadge user={u} /> },
    { header: "Permissions", key: "perms", render: (u) => <PermissionsCount user={u} /> },
    { header: "Last Login", key: "last", render: (u) => u.last_login_at ? formatDate(u.last_login_at) : "Never", hideOnMobile: true },
    { header: "Actions", key: "actions", render: (u) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/users/${u.id}`)}>
            <Eye className="mr-2 h-4 w-4" /> View profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/settings/staff-access/${u.id}/permissions`)}>
            <KeyRound className="mr-2 h-4 w-4" /> View / Edit permissions
          </DropdownMenuItem>
          {u.account_status === "suspended" ? (
            <DropdownMenuItem onClick={() => changeStatus.mutate({ id: u.id, action: "activate" })}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Restore access
            </DropdownMenuItem>
          ) : u.account_status === "inactive" ? (
            <DropdownMenuItem onClick={() => changeStatus.mutate({ id: u.id, action: "activate" })}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Activate account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => changeStatus.mutate({ id: u.id, action: "suspend", reason: "Suspended by admin" })}
            >
              <Ban className="mr-2 h-4 w-4" /> Suspend access
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => resetPermissions(u)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reset permissions
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPromoteTarget(u)}>
            <Shield className="mr-2 h-4 w-4" /> Promote to admin
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => revokeStaff(u)}>
            <UserMinus className="mr-2 h-4 w-4" /> Revoke staff access
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Staff Access</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> Add staff
        </Button>
      </div>
      <Card>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No staff accounts yet"
        />
        {data && <Pagination page={page} pageSize={12} total={data.total} onPageChange={setPage} />}
      </Card>

      <AddStaffDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmDialog
        open={!!promoteTarget}
        onOpenChange={(o) => !o && setPromoteTarget(null)}
        title={`Promote ${promoteTarget?.full_name || "this account"} to admin?`}
        description="Grants full, unconditional access to every module — this replaces their staff role and permissions, not adds to them."
        confirmLabel="Promote to admin"
        loading={changeRole.isPending}
        onConfirm={() => {
          if (promoteTarget) {
            changeRole.mutate(
              { id: promoteTarget.id, role: "admin" },
              { onSuccess: () => setPromoteTarget(null) },
            );
          }
        }}
      />
    </div>
  );
}

function ProfileBadge({ user }: { user: AppUser }) {
  const { data: modules, isLoading } = useUserPermissions(user.id);
  const { data: catalog } = usePermissionCatalog();
  if (isLoading || !catalog) return <span className="text-xs text-muted-foreground">Loading...</span>;

  const code = matchProfileName(catalog, modules ?? []);
  if (code === CUSTOM_PROFILE) return <Badge variant="outline">Custom</Badge>;

  const profile = catalog.profiles.find((p) => p.code === code);
  return <Badge variant="secondary">{profile?.label ?? code}</Badge>;
}

function PermissionsCount({ user }: { user: AppUser }) {
  const { data: modules, isLoading } = useUserPermissions(user.id);
  if (isLoading) return <span className="text-xs text-muted-foreground">Loading...</span>;
  const total = (modules ?? []).reduce((sum, m) => sum + m.actions.length, 0);
  if (total === 0) return <Badge variant="muted">No permissions</Badge>;
  return <Badge>{total} permission{total === 1 ? "" : "s"}</Badge>;
}
