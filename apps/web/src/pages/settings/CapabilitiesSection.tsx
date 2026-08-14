import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchBar } from "@/components/common/SearchBar";
import { useUsers, useUserCapabilities, useReplaceCapabilities } from "@/hooks/useUsers";
import { useAuthStore } from "@/store/authStore";
import { useToastStore } from "@/store/toastStore";
import { CAPABILITY_LABELS, type Capability } from "@/types";
import { initials } from "@/lib/utils";

const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABELS) as Capability[];

/**
 * Grant and revoke the capabilities that gate raw rider personal data.
 *
 * Without this screen the only capability holders would be the admins the
 * migration backfilled, and there would be no way to narrow that set — which
 * would leave the least-privilege work half-done.
 */
export function CapabilitiesSection() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const me = useAuthStore((s) => s.user);

  // Riders never hold capabilities, so the picker is scoped to staff accounts.
  const { data: staff, isLoading } = useUsers({ page: 1, pageSize: 25, search, staffOnly: true });
  const accounts = staff?.data ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Staff accounts</CardTitle>
          <CardDescription>
            Pick an account to review what raw personal data it can reach.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email or phone..." />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff accounts matched.</p>
          ) : (
            accounts.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedId(u.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selectedId === u.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials(u.full_name || "?")}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.full_name || "Unnamed"}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email ?? u.phone}</p>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {selectedId ? (
        <CapabilityEditor
          userId={selectedId}
          isSelf={selectedId === me?.id}
          name={accounts.find((u) => u.id === selectedId)?.full_name ?? "this account"}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ShieldAlert}
              title="No account selected"
              description="Capabilities are granted per person, never implied by a role. Choose an account to begin."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CapabilityEditor({
  userId,
  isSelf,
  name,
}: {
  userId: string;
  isSelf: boolean;
  name: string;
}) {
  const { data, isLoading } = useUserCapabilities(userId);
  const replace = useReplaceCapabilities();
  const toast = useToastStore((s) => s.push);
  const [draft, setDraft] = useState<Capability[]>([]);

  // Re-seed whenever the server state or the selected account changes.
  useEffect(() => {
    if (data) setDraft(data.capabilities);
  }, [data, userId]);

  const saved = data?.capabilities ?? [];
  const dirty =
    draft.length !== saved.length || draft.some((c) => !saved.includes(c));

  const toggle = (cap: Capability, on: boolean) =>
    setDraft((prev) => (on ? [...new Set([...prev, cap])] : prev.filter((c) => c !== cap)));

  const save = async () => {
    try {
      await replace.mutateAsync({ id: userId, capabilities: draft });
      toast({
        tone: "success",
        title: "Capabilities updated",
        message: draft.length === 0
          ? `${name} can no longer access raw personal data.`
          : `${name} now holds: ${draft.map((c) => CAPABILITY_LABELS[c].label).join(", ")}.`,
      });
    } catch (err) {
      toast({ tone: "error", title: "Could not update capabilities", message: (err as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capabilities</CardTitle>
        <CardDescription>
          These control access to riders' identity documents and personal data. Every change is
          recorded in the audit log. Grant only what the person's job actually needs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSelf && (
          <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              You cannot change your own capabilities — an administrator who can grant themselves
              access to ID documents has not been restricted from anything. Ask a colleague.
            </p>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          ALL_CAPABILITIES.map((cap) => (
            <div
              key={cap}
              className="flex items-start justify-between gap-4 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{CAPABILITY_LABELS[cap].label}</p>
                <p className="text-xs text-muted-foreground">{CAPABILITY_LABELS[cap].description}</p>
              </div>
              <Switch
                checked={draft.includes(cap)}
                disabled={isSelf || replace.isPending}
                onCheckedChange={(on) => toggle(cap, on)}
              />
            </div>
          ))
        )}

        <div className="flex items-center justify-end gap-2">
          {dirty && !isSelf && (
            <Button variant="ghost" onClick={() => setDraft(saved)} disabled={replace.isPending}>
              Cancel
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || isSelf || replace.isPending}>
            {replace.isPending ? "Saving..." : `Save for ${name.split(" ")[0]}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
