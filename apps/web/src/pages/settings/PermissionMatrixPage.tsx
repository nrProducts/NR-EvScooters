import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { useUser, useUserPermissions, useUpdateUserPermissions } from "@/hooks/useUsers";
import {
  matchProfileName, permissionsForModule, profileToModules, usePermissionCatalog,
} from "@/hooks/usePermissionCatalog";
import { CUSTOM_PROFILE } from "@/types";
import type { ModuleKey, ModulePermission, PermissionProfileName } from "@/types";

export default function PermissionMatrixPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data: user, isLoading: userLoading, isError: userError } = useUser(userId);
  const { data: saved, isLoading: permsLoading } = useUserPermissions(userId);
  // Modules, actions and profiles all come from the server now — the three
  // hard-coded tables this screen used to render from are gone.
  const { data: catalog, isLoading: catalogLoading, isError: catalogError } = usePermissionCatalog();
  const updatePermissions = useUpdateUserPermissions();

  const [pending, setPending] = useState<ModulePermission[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-sync local edit state whenever the fetched grant set changes (first
  // load, or after a save round-trips) — but never overwrite in-progress edits.
  useEffect(() => {
    if (saved && pending === null) setPending(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  if (userLoading || permsLoading || catalogLoading || pending === null || !catalog) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (userError || !user) return <ErrorState message="Staff account not found." />;
  if (catalogError) return <ErrorState message="Could not load the permission catalogue." />;

  const actionsFor = (moduleKey: ModuleKey): string[] =>
    pending.find((m) => m.module_key === moduleKey)?.actions ?? [];

  const toggle = (moduleKey: ModuleKey, action: string, checked: boolean) => {
    setSaveError(null);
    setPending((prev) => {
      const list = prev ?? [];
      const existing = list.find((m) => m.module_key === moduleKey);
      const nextActions = checked
        ? Array.from(new Set([...(existing?.actions ?? []), action]))
        : (existing?.actions ?? []).filter((a) => a !== action);
      const withoutModule = list.filter((m) => m.module_key !== moduleKey);
      return nextActions.length > 0
        ? [...withoutModule, { module_key: moduleKey, actions: nextActions }]
        : withoutModule;
    });
  };

  const applyProfile = (profile: PermissionProfileName) => {
    setSaveError(null);
    setPending(profileToModules(catalog, profile));
  };

  const currentProfile = matchProfileName(catalog, pending);
  const currentProfileLabel =
    catalog.profiles.find((p) => p.code === currentProfile)?.label ?? "Custom";
  // Inactive modules stay out: a module switched off by migration has no
  // console section to open, so granting inside it would be a dead checkbox.
  const modules = catalog.modules.filter((m) => m.isActive);
  const totalGranted = pending.reduce((sum, m) => sum + m.actions.length, 0);
  const dirty = JSON.stringify([...pending].sort((a, b) => a.module_key.localeCompare(b.module_key))) !==
    JSON.stringify([...(saved ?? [])].sort((a, b) => a.module_key.localeCompare(b.module_key)));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Manage permissions — {user.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {user.email ?? user.phone} · {totalGranted} permission{totalGranted === 1 ? "" : "s"} granted
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Permission profile</CardTitle>
            <CardDescription>
              Apply a preset as a starting point, then customise below. Editing any checkbox switches this to Custom.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={currentProfile === CUSTOM_PROFILE ? "outline" : "secondary"}>
              {currentProfileLabel}
            </Badge>
            <Select onValueChange={applyProfile}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Apply a profile..." /></SelectTrigger>
              <SelectContent>
                {catalog.profiles.map((profile) => (
                  <SelectItem key={profile.code} value={profile.code}>{profile.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {modules.map((module) => {
          const granted = actionsFor(module.key);
          return (
            <Card key={module.key}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">{module.label}</CardTitle>
                {granted.length > 0 && <Badge variant="success">{granted.length} on</Badge>}
              </CardHeader>
              <CardContent className="space-y-2">
                {permissionsForModule(catalog, module.key).map((permission) => (
                  <div
                    key={permission.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                    title={
                      permission.isEnforced
                        ? permission.description ?? undefined
                        : "No route enforces this permission yet."
                    }
                  >
                    <Label
                      className={`cursor-pointer text-sm font-normal ${permission.isEnforced ? "" : "text-muted-foreground"}`}
                    >
                      {permission.label}
                      {!permission.isEnforced && <Info className="ml-1 inline h-3 w-3 align-text-top" />}
                    </Label>
                    <Switch
                      checked={granted.includes(permission.action)}
                      disabled={!permission.isEnforced}
                      onCheckedChange={(checked) => toggle(module.key, permission.action, checked)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {saveError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <div className="sticky bottom-4 flex justify-end gap-2 rounded-lg border border-border bg-card p-3 shadow-soft">
        <Button variant="outline" onClick={() => setPending(saved ?? [])} disabled={!dirty}>
          Discard changes
        </Button>
        <Button
          disabled={!dirty || updatePermissions.isPending}
          onClick={() => {
            if (!userId) return;
            updatePermissions.mutate(
              { id: userId, modules: pending },
              { onError: (err) => setSaveError(err instanceof Error ? err.message : "Could not save permissions.") },
            );
          }}
        >
          {updatePermissions.isPending ? "Saving..." : "Save permissions"}
        </Button>
      </div>
    </div>
  );
}
