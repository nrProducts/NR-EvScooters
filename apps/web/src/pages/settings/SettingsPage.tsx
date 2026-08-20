import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Plus, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { NotConnected } from "@/components/common/NotConnected";
import { useUiStore } from "@/store/uiStore";
import { useUsers, useUserPermissions } from "@/hooks/useUsers";
import { usePermissionCatalog } from "@/hooks/usePermissionCatalog";
import { useAuthStore } from "@/store/authStore";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { AppUser } from "@/types";
import StaffAccessSection from "./StaffAccessSection";

const ADMIN_ONLY_SECTIONS = ["roles", "staff-access"] as const;

/**
 * "settings" module grant only ever unlocks the generic tabs below —
 * Roles & Staff / Staff Access stay hard-coded to role === "admin"
 * regardless of any grant, since they are where staff/permission management
 * itself lives (requirement: only an Admin may manage Staff permissions —
 * see users.routes.ts, every one of those endpoints is requireAdmin).
 *
 * The Capabilities tab is gone. kyc_reviewer, rights_officer and pii_exporter
 * were a second authorisation axis with its own screen and its own endpoints;
 * they are ordinary permissions now — kyc.reveal_number, privacy.process,
 * privacy.export — granted from the permission matrix alongside everything
 * else, which is one screen fewer and one fewer place for the two to disagree.
 */
const SECTIONS = [
  { value: "roles", label: "Roles & Staff" },
  { value: "staff-access", label: "Staff Access" },
  { value: "company", label: "Company" },
  { value: "security", label: "Security" },
  { value: "api-keys", label: "API Keys" },
  { value: "branding", label: "Branding & Theme" },
] as const;

export default function SettingsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const visibleSections = SECTIONS.filter(
    (s) => role === "admin" || !ADMIN_ONLY_SECTIONS.includes(s.value as (typeof ADMIN_ONLY_SECTIONS)[number]),
  );
  const [tab, setTab] = useState<(typeof SECTIONS)[number]["value"]>(visibleSections[0]?.value ?? "company");
  const { theme, toggleTheme } = useUiStore();
  const { data: admins, isLoading: loadingAdmins } = useUsers({ page: 1, pageSize: 50, role: "admin" });
  const { data: staff, isLoading: loadingStaff } = useUsers({ page: 1, pageSize: 50, role: "staff" });
  const adminAccounts = admins?.data ?? [];
  const staffAccounts = staff?.data ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Company, roles and platform configuration</p>
        </div>
        {role === "admin" && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/notification-manager">
              Notification Manager <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap">
          {visibleSections.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
          ))}
        </TabsList>

        {role === "admin" && (
        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Staff accounts</CardTitle>
                <CardDescription>
                  Each staff account only sees the modules granted below — enforced by the API, not just hidden
                  from the sidebar. Manage staff access and permissions from the Staff Access tab.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings" state={{ tab: "staff-access" }}>
                  Staff Access <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingStaff ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : staffAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No staff accounts yet — create staff accounts from the Staff Access tab.
                </p>
              ) : (
                staffAccounts.map((r) => <StaffAccountRow key={r.id} user={r} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin accounts</CardTitle>
              <CardDescription>
                Full, unconditional access to every module — pulled live from <code>GET /users</code>, filtered
                to the <code>admin</code> role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingAdmins ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : adminAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No admin accounts found in the first page of users.</p>
              ) : (
                adminAccounts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials(r.full_name || "?")}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{r.full_name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">{r.email ?? r.phone}</p>
                      </div>
                    </div>
                    <StatusBadge status={r.account_status} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {role === "admin" && (
        <TabsContent value="staff-access">
          <StaffAccessSection />
        </TabsContent>
        )}

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Company details</CardTitle>
              <CardDescription>
                Display-only for now — there's no settings/company endpoint on the backend, so these fields
                aren't persisted anywhere yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal entity name" defaultValue="Swapngo Fleet Hub" />
              <Field label="Brand name" defaultValue="Swapngo" />
              <Field label="Support phone" defaultValue="" placeholder="Not set" />
              <Field label="Support email" defaultValue="" placeholder="Not set" />
              <Field label="Operating city" defaultValue="Chennai" />
              <Field label="Service areas" defaultValue="" placeholder="Not set" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardContent className="p-0">
              <NotConnected
                title="No security settings API yet"
                description="2FA enforcement, session timeout and login alerts aren't configurable from the backend today."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <CardTitle>API keys</CardTitle>
              <CardDescription>
                The web console authenticates as a normal Supabase user (see Login), not via API key — there's
                no service-key management endpoint exposed here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3 opacity-60">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Supabase anon key</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    set via VITE_SUPABASE_ANON_KEY in .env
                  </p>
                </div>
                <Button variant="ghost" size="icon" disabled><Copy className="h-4 w-4" /></Button>
              </div>
              <Button variant="outline" disabled>
                <Plus className="h-4 w-4" /> Generate new key (not available)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>Branding &amp; theme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Dark mode</p>
                  <p className="text-xs text-muted-foreground">Applies across the whole admin console</p>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
              <div className="space-y-1.5">
                <Label>Default language</Label>
                <Select defaultValue="en">
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ta">Tamil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Read-only overview row — one per staff account, showing its granted module badges. Editing lives on the Users page. */
function StaffAccountRow({ user }: { user: AppUser }) {
  const { data: modules, isLoading } = useUserPermissions(user.id);
  // Module labels come from the catalogue rather than a hard-coded map, so a
  // module added by migration reads as its label here instead of its key.
  const { data: catalog } = usePermissionCatalog();
  const moduleLabels = Object.fromEntries(
    (catalog?.modules ?? []).map((m) => [m.key, m.label]),
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials(user.full_name || "?")}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{user.full_name || "Unnamed"}</p>
          <p className="text-xs text-muted-foreground">{user.email ?? user.phone}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        {isLoading ? (
          <span className="text-xs text-muted-foreground">Loading...</span>
        ) : !modules || modules.length === 0 ? (
          <Badge variant="muted">No modules granted</Badge>
        ) : (
          modules.map((m) => (
            <Badge key={m.module_key} variant="secondary">
              {moduleLabels[m.module_key] ?? m.module_key} · {m.actions.length}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

function Field({ label, defaultValue, type = "text", placeholder }: { label: string; defaultValue: string; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} defaultValue={defaultValue} placeholder={placeholder} disabled />
    </div>
  );
}
