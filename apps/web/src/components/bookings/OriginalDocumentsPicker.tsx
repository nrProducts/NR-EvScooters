import { FileCheck2, FileX2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ORIGINAL_DOC_OPTIONS, type OriginalsInput } from "@/services/api/originals";

/**
 * "Original documents collected" — part of Confirm pickup, for EVERY rider.
 *
 * The staff member must pick one of two things: originals were taken (and which),
 * or no originals were taken. Nothing is pre-selected, so the question cannot be
 * skipped by clicking straight through.
 */
export interface OriginalsDraft {
  mode: "unset" | "none" | "taken";
  driving_licence: boolean;
  voter_id: boolean;
  marksheet: boolean;
  other: boolean;
  other_label: string;
}

export const EMPTY_ORIGINALS: OriginalsDraft = {
  mode: "unset", driving_licence: false, voter_id: false, marksheet: false, other: false, other_label: "",
};

/** The request body for the draft, or null while it is incomplete. */
export function draftToInput(d: OriginalsDraft): OriginalsInput | null {
  if (d.mode === "none") return { none: true };
  if (d.mode !== "taken") return null;
  const documents: { type: "driving_licence" | "voter_id" | "marksheet" | "other"; other_label?: string }[] = [];
  for (const o of ORIGINAL_DOC_OPTIONS) if (d[o.type]) documents.push({ type: o.type });
  if (d.other) {
    const label = d.other_label.trim();
    if (!label) return null;
    documents.push({ type: "other", other_label: label });
  }
  return documents.length > 0 ? { documents } : null;
}

/** What is still missing, in words — shown under the picker. */
export function draftProblem(d: OriginalsDraft): string | null {
  if (d.mode === "unset") return "Choose whether original documents were taken.";
  if (d.mode === "taken") {
    const any = d.driving_licence || d.voter_id || d.marksheet || d.other;
    if (!any) return "Tick each original document you took.";
    if (d.other && !d.other_label.trim()) return "Say what the other document is.";
  }
  return null;
}

export function OriginalDocumentsPicker({
  value, onChange,
}: { value: OriginalsDraft; onChange: (next: OriginalsDraft) => void }) {
  const set = (patch: Partial<OriginalsDraft>) => onChange({ ...value, ...patch });
  const problem = draftProblem(value);

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">
        Original documents <span className="text-destructive">*</span>
      </legend>

      <div className="grid grid-cols-2 gap-2">
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-smooth",
            value.mode === "taken" ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted/50",
          )}
        >
          <input type="radio" name="originals-mode" className="sr-only" checked={value.mode === "taken"} onChange={() => set({ mode: "taken" })} />
          <FileCheck2 className="h-4 w-4 shrink-0" /> Originals taken
        </label>
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-smooth",
            value.mode === "none" ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted/50",
          )}
        >
          <input type="radio" name="originals-mode" className="sr-only" checked={value.mode === "none"} onChange={() => set({ mode: "none" })} />
          <FileX2 className="h-4 w-4 shrink-0" /> No originals taken
        </label>
      </div>

      {value.mode === "taken" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Tick every original you are keeping:</p>
          {ORIGINAL_DOC_OPTIONS.map((o) => (
            <label key={o.type} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={value[o.type]}
                onChange={(e) => set({ [o.type]: e.target.checked } as Partial<OriginalsDraft>)}
              />
              {o.label}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={value.other}
              onChange={(e) => set({ other: e.target.checked })}
            />
            Other
          </label>
          {value.other ? (
            <Input
              autoFocus
              maxLength={80}
              placeholder="What is it? e.g. Ration card"
              value={value.other_label}
              onChange={(e) => set({ other_label: e.target.value })}
            />
          ) : null}
        </div>
      ) : null}

      {problem ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
    </fieldset>
  );
}
