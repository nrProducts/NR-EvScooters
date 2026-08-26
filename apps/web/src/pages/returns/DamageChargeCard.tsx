import { useState } from "react";
import { AlertTriangle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRemoveDamageCharge } from "@/hooks/useReturns";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Damage, DamageCategory } from "@/types";

const DAMAGE_TYPE_LABEL: Record<DamageCategory, string> = {
  body: "Body Damage",
  panel: "Panel Damage",
  battery: "Battery Damage",
  tyre: "Tyre Damage",
  brake: "Brake Damage",
  electrical: "Electrical Damage",
  other: "Other Damage",
};

interface DamageChargeCardProps {
  rentalId: string;
  damage: Damage;
  /** Removal is only allowed while the return hasn't been approved yet. */
  canRemove: boolean;
}

export function DamageChargeCard({ rentalId, damage, canRemove }: DamageChargeCardProps) {
  const [showPhotos, setShowPhotos] = useState(false);
  const removeDamageCharge = useRemoveDamageCharge();

  const handleRemove = () => {
    removeDamageCharge.mutate(
      { rentalId, damageId: damage.id },
      {
        onSuccess: () => toastSuccess("Damage charge removed"),
        onError: (err) => toastError(err, "Could not remove damage charge"),
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">
            {damage.damage_category ? DAMAGE_TYPE_LABEL[damage.damage_category] : "Damage Charge"}
          </span>
        </div>
        <span className="shrink-0 text-sm font-bold text-destructive">{formatCurrency(damage.amount)}</span>
      </div>

      <p className="mt-1.5 text-sm text-foreground/90">{damage.description}</p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] text-muted-foreground">
          Added by {damage.reported_by?.full_name ?? "Admin"} • {formatDateTime(damage.created_at)}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {damage.photo_urls.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowPhotos((v) => !v)}>
              <ImageIcon className="h-3.5 w-3.5" /> {showPhotos ? "Hide" : "Photos"}
            </Button>
          )}
          {canRemove && damage.status === "assessed" && (
            <Button
              variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              disabled={removeDamageCharge.isPending}
              onClick={handleRemove}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      {showPhotos && damage.photo_urls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {damage.photo_urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-border">
              <img src={url} alt={`Damage photo ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
