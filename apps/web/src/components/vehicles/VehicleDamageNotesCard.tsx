import { useState } from "react";
import { AlertTriangle, Plus, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useAddVehicleDamageNote, useDeleteVehicleDamageNote, useVehicleDamageNotes } from "@/hooks/useVehicles";
import type { VehicleDamageNote } from "@/services/api/vehicles";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { formatDate } from "@/lib/utils";

/**
 * Known damage on this scooter — scratches, a cracked panel, a loose mirror
 * it ALREADY has when it goes out to a rider, noted so the next rider isn't
 * charged for it. Once repaired, staff mark it resolved, which deletes the note.
 * Not the rider damage charges (those are incidents billed to a rider).
 */
export function VehicleDamageNotesCard({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const { data: notes, isLoading, isError, refetch } = useVehicleDamageNotes(vehicleId);
  const addNote = useAddVehicleDamageNote();
  const deleteNote = useDeleteVehicleDamageNote();
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [resolving, setResolving] = useState<VehicleDamageNote | null>(null);

  const trimmed = description.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;

  const save = () => {
    if (trimmed.length < 3) return;
    addNote.mutate({ vehicleId, description: trimmed }, {
      onSuccess: () => {
        toastSuccess("Damage noted");
        setDescription("");
        setAdding(false);
      },
      onError: (err) => toastError(err, "Could not save the damage note"),
    });
  };

  const count = notes?.length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className={count > 0 ? "h-4 w-4 text-amber-500" : "h-4 w-4"} />
          Known damage
          {count > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              {count}
            </span>
          )}
        </CardTitle>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {adding && (
          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="damage-note">What is damaged?</Label>
            <Textarea
              id="damage-note"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Scratch on the left side panel, rear mirror loose"
              maxLength={500}
              rows={3}
              autoFocus
            />
            {tooShort && <p className="text-xs text-destructive">Describe the damage in at least 3 characters.</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setDescription("");
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={trimmed.length < 3 || addNote.isPending}>
                {addNote.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : isError ? (
          <p className="text-xs text-muted-foreground">
            Could not load damage notes.{" "}
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => refetch()}>
              Retry
            </button>
          </p>
        ) : count === 0 ? (
          !adding && <p className="text-xs text-muted-foreground">No known damage on this scooter.</p>
        ) : (
          notes!.map((note) => (
            <div key={note.id} className="flex items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0">
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words">{note.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Noted {formatDate(note.created_at)}
                  {note.noted_by ? ` by ${note.noted_by.full_name}` : ""}
                </p>
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setResolving(note)}
                  title="Damage repaired — remove this note"
                >
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Resolved
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>

      <ConfirmDialog
        open={!!resolving}
        onOpenChange={(o) => !o && setResolving(null)}
        title="Mark this damage as repaired?"
        description={resolving ? `"${resolving.description}" will be removed from this scooter's known damage.` : undefined}
        confirmLabel="Yes, repaired"
        loading={deleteNote.isPending}
        onConfirm={() =>
          resolving &&
          deleteNote.mutate(resolving.id, {
            onSuccess: () => {
              toastSuccess("Damage marked as repaired");
              setResolving(null);
            },
            onError: (err) => toastError(err, "Could not remove the damage note"),
          })
        }
      />
    </Card>
  );
}
