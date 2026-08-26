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
    <div className="space-y-2 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-semibold">
            {damage.damage_category ? DAMAGE_TYPE_LABEL[damage.damage_category] : "Damage Charge"}
          </span>
        </div>
        <span className="text-base font-bold text-destructive">{formatCurrency(damage.amount)}</span>
      </div>

      <p className="text-sm text-foreground/90">{damage.description}</p>

      <p className="text-[0.6875rem] text-muted-foreground">
        Added by {damage.reported_by?.full_name ?? "Admin"} • {formatDateTime(damage.created_at)}
      </p>

      <div className="flex items-center gap-2 pt-1">
        {damage.photo_urls.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowPhotos((v) => !v)}>
            <ImageIcon className="h-3.5 w-3.5" /> {showPhotos ? "Hide Photos" : "View Photos"}
          </Button>
        )}
        {canRemove && damage.status === "assessed" && (
          <Button
            variant="outline" size="sm" className="text-destructive hover:text-destructive"
            disabled={removeDamageCharge.isPending}
            onClick={handleRemove}
          >
            Remove
          </Button>
        )}
      </div>

      {showPhotos && damage.photo_urls.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
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
