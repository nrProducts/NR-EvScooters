import { useState } from "react";
import { Copy } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateStaffUser } from "@/hooks/useUsers";
import { useToastStore } from "@/store/toastStore";
import { usePermissionCatalog } from "@/hooks/usePermissionCatalog";
import type { AccountStatus, PermissionProfileName } from "@/types";

const EMPTY = {
  full_name: "", email: "", phone: "", staff_code: "",
  role: "staff" as "staff" | "admin",
  permission_profile: "" as PermissionProfileName,
  account_status: "active" as AccountStatus,
};

export default function AddStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);
  const createStaff = useCreateStaffUser();
  // Profiles are `permission_profiles` rows now, so the list is fetched
  // rather than imported. An empty catalogue simply offers no preset, which
  // is the same as the "grant nothing yet" default.
  const { data: catalog } = usePermissionCatalog();
  const push = useToastStore((s) => s.push);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const close = (o: boolean) => {
    if (!o) {
      setForm(EMPTY);
      setError(null);
      setRevealed(null);
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
        role: form.role,
        account_status: form.account_status,
        permission_profile: form.role === "staff" ? form.permission_profile || undefined : undefined,
      },
      {
        onSuccess: (data) => {
          if (data.temporary_password) {
            setRevealed({ email: form.email.trim(), password: data.temporary_password });
          } else {
            push({ tone: "success", title: "Staff account created", message: `${form.full_name.trim()} can now sign in.` });
            close(false);
          }
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Could not create the account.";
          setError(message);
          push({ tone: "error", title: "Could not create account", message });
        },
      },
    );
  };

  const copyPassword = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.password);
      push({ tone: "success", title: "Copied", message: "Temporary password copied to the clipboard." });
    } catch {
      push({ tone: "warning", title: "Copy blocked", message: "Your browser blocked clipboard access." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {revealed ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                Share this temporary password with {revealed.email} through a secure channel. They'll be required to
                set their own password the first time they sign in.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span className="select-all font-mono text-sm">{revealed.password}</span>
                <Button variant="outline" size="sm" onClick={copyPassword}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                This won't be shown again — if it's lost, you'll need to reset the account's password instead.
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{form.role === "admin" ? "Add admin" : "Add staff"}</DialogTitle>
              <DialogDescription>
                Creates the account with a temporary password for you to share with them — it can't sign in to the
                admin console until you do, and stays inactive until you set its status to Active.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Full name</Label>
                  <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone" />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => set("role", v as "staff" | "admin")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.role === "admin" && (
                    <p className="text-xs text-muted-foreground">Full, unconditional access to every module.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Staff ID <span className="text-muted-foreground">(optional)</span></Label>
                  <Input value={form.staff_code} onChange={(e) => set("staff_code", e.target.value)} placeholder="Staff code" />
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

              {form.role === "staff" && (
                <div className="space-y-1.5">
                  <Label>Permission profile</Label>
                  <Select
                    value={form.permission_profile}
                    onValueChange={(v) => set("permission_profile", v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Custom — grant permissions after creating" /></SelectTrigger>
                    <SelectContent>
                      {(catalog?.profiles ?? []).map((profile) => (
                        <SelectItem key={profile.code} value={profile.code}>{profile.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Applies a starting set of permissions immediately. Leave blank to grant nothing yet and build a
                    custom set from Staff Access → Edit permissions once the account exists.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={submit} disabled={createStaff.isPending}>
                {createStaff.isPending ? "Creating account..." : "Create account"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
