import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { NotConnected } from "@/components/common/NotConnected";
import { useUiStore } from "@/store/uiStore";
import { useUsers } from "@/hooks/useUsers";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CapabilitiesSection } from "./CapabilitiesSection";

const SECTIONS = [
  { value: "roles", label: "Roles & Staff" },
  { value: "capabilities", label: "Capabilities" },
  { value: "company", label: "Company" },
  { value: "security", label: "Security" },
  { value: "api-keys", label: "API Keys" },
  { value: "branding", label: "Branding & Theme" },
] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof SECTIONS)[number]["value"]>("roles");
  const { theme, toggleTheme } = useUiStore();
  const { data: admins, isLoading } = useUsers({ page: 1, pageSize: 50, role: "admin" });
  const adminAccounts = admins?.data ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Company, roles and platform configuration</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Admin accounts</CardTitle>
              <CardDescription>
                Pulled live from <code>GET /users</code>, filtered to the <code>admin</code> role. There's no
                self-serve way to grant roles from here — <code>PUT /users/:id/roles</code> exists on the
                backend, but building a safe UI for it (only admins should ever grant admin) is left for later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
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

        <TabsContent value="capabilities">
          <CapabilitiesSection />
        </TabsContent>

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

function Field({ label, defaultValue, type = "text", placeholder }: { label: string; defaultValue: string; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} defaultValue={defaultValue} placeholder={placeholder} disabled />
    </div>
  );
}
