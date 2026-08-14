import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateStaffUser } from "@/hooks/useUsers";
import { PERMISSION_PROFILE_NAMES, PERMISSION_PROFILES } from "@/config/permissionProfiles";
import type { PermissionProfileName } from "@/config/permissionProfiles";
import type { AccountStatus } from "@/types";

const EMPTY = {
  full_name: "", email: "", phone: "", staff_code: "",
  permission_profile: "" as Exclude<PermissionProfileName, "custom"> | "",
  account_status: "active" as AccountStatus,
};

export default function AddStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const createStaff = useCreateStaffUser();

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const close = (o: boolean) => {
    if (!o) {
      setForm(EMPTY);
      setError(null);
    }
    onOpenChange(o);
  };

  const submit = () => {
    setError(null);
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Full name, email and phone are required.");
      return;
    }
    createStaff.mutate(
      {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        staff_code: form.staff_code.trim() || undefined,
        role: "staff",
        account_status: form.account_status,
        permission_profile: form.permission_profile || undefined,
      },
      {
        onSuccess: () => close(false),
        onError: (err) => setError(err instanceof Error ? err.message : "Could not create the staff account."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>
            Sends an email invite — the account can't sign in to the admin console until they complete their own
            password setup, and stays inactive until you set its status to Active.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Priya Kumar" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="priya@swapngo.in" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-1.5">
              <Label>Staff ID <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={form.staff_code} onChange={(e) => set("staff_code", e.target.value)} placeholder="e.g. EMP-014" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.account_status} onValueChange={(v) => set("account_status", v as AccountStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Permission profile</Label>
            <Select
              value={form.permission_profile}
              onValueChange={(v) => set("permission_profile", v as Exclude<PermissionProfileName, "custom">)}
            >
              <SelectTrigger><SelectValue placeholder="Custom — grant permissions after creating" /></SelectTrigger>
              <SelectContent>
                {PERMISSION_PROFILE_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>{PERMISSION_PROFILES[name].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Applies a starting set of permissions immediately. Leave blank to grant nothing yet and build a
              custom set from Staff Access → Edit permissions once the account exists.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createStaff.isPending}>
            {createStaff.isPending ? "Sending invite..." : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
