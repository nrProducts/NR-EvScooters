import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useUiStore } from "@/store/uiStore";
import { STAFF_MEMBERS } from "@/services/api/staff";

const SECTIONS = [
  { value: "company", label: "Company" },
  { value: "fleet", label: "Fleet Settings" },
  { value: "pricing", label: "Pricing" },
  { value: "roles", label: "Roles & Permissions" },
  { value: "security", label: "Security" },
  { value: "integrations", label: "Integrations" },
  { value: "api-keys", label: "API Keys" },
  { value: "branding", label: "Branding & Theme" },
] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof SECTIONS)[number]["value"]>("company");
  const { theme, toggleTheme } = useUiStore();

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Company, fleet, pricing and platform configuration</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Company details</CardTitle>
              <CardDescription>Legal and display information for invoices and rider-facing screens.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal entity name" defaultValue="Swapngo Fleet Hub" />
              <Field label="Brand name" defaultValue="Swapngo" />
              <Field label="Support phone" defaultValue="+91 9XXXXXXXXX" />
              <Field label="Support email" defaultValue="support@swapngo.in" />
              <Field label="Operating city" defaultValue="Chennai" />
              <Field label="Service areas" defaultValue="Sholinganallur, Thoraipakkam" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fleet">
          <Card>
            <CardHeader>
              <CardTitle>Fleet settings</CardTitle>
              <CardDescription>Defaults applied across the vehicle fleet.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Default vehicle model" defaultValue="Motovolt MVS7" />
              <Field label="Low battery threshold (%)" defaultValue="20" type="number" />
              <Field label="Service interval (km)" defaultValue="1500" type="number" />
              <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Auto-flag GPS loss</p>
                  <p className="text-xs text-muted-foreground">Notify staff when a vehicle's GPS goes offline for 10+ minutes</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle>Rental plans</CardTitle>
              <CardDescription>Base pricing for daily, weekly and monthly rentals.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field label="Daily plan (₹)" defaultValue="350" type="number" />
              <Field label="Weekly plan (₹)" defaultValue="2200" type="number" />
              <Field label="Monthly plan (₹)" defaultValue="8000" type="number" />
              <Field label="Security deposit (₹)" defaultValue="2000" type="number" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Staff &amp; roles</CardTitle>
              <CardDescription>Only Admins can manage roles and permissions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {STAFF_MEMBERS.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{s.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full">
                <Plus className="h-4 w-4" /> Invite staff member
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow title="Require 2FA for Admin accounts" description="Adds an OTP step at login for admin users" />
              <ToggleRow title="Auto sign-out after inactivity" description="Signs staff out after 30 minutes idle" defaultChecked />
              <ToggleRow title="Login alerts" description="Email admins on sign-in from a new device" defaultChecked />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Connect third-party services used across the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {["Supabase (auth & database)", "MSG91 (SMS/OTP)", "Payment gateway", "Google Maps"].map((name) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{name}</p>
                  <StatusBadge status={name.includes("Supabase") ? "active" : "pending"} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <CardTitle>API keys</CardTitle>
              <CardDescription>Used by the rider app and internal services to call the platform API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Production key</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">sk_live_••••••••••••4f21</p>
                </div>
                <Button variant="ghost" size="icon"><Copy className="h-4 w-4" /></Button>
              </div>
              <Button variant="outline">
                <Plus className="h-4 w-4" /> Generate new key
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

function Field({ label, defaultValue, type = "text" }: { label: string; defaultValue: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} defaultValue={defaultValue} />
    </div>
  );
}

function ToggleRow({ title, description, defaultChecked }: { title: string; description: string; defaultChecked?: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch defaultChecked={defaultChecked} />
      </div>
    </>
  );
}
