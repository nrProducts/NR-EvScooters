import { useState } from "react";
import { X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddDamageCharge } from "@/hooks/useReturns";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import type { DamageCategory } from "@/types";

const DAMAGE_TYPE_OPTIONS: { value: DamageCategory; label: string }[] = [
  { value: "body", label: "Body Damage" },
  { value: "panel", label: "Panel Damage" },
  { value: "battery", label: "Battery Damage" },
  { value: "tyre", label: "Tyre Damage" },
  { value: "brake", label: "Brake Damage" },
  { value: "electrical", label: "Electrical Damage" },
  { value: "other", label: "Other" },
];

const MAX_PHOTOS = 6;

interface AddDamageChargeModalProps {
  rentalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDamageChargeModal({ rentalId, open, onOpenChange }: AddDamageChargeModalProps) {
  const [damageType, setDamageType] = useState<DamageCategory | "">("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const addDamageCharge = useAddDamageCharge();

  const reset = () => {
    setDamageType("");
    setAmount("");
    setDescription("");
    setPhotos([]);
  };

  const valid = !!damageType && Number(amount) > 0 && description.trim().length >= 3;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setPhotos((prev) => [...prev, ...Array.from(files)].slice(0, MAX_PHOTOS));
  };

  const handleSubmit = () => {
    if (!valid || !damageType) return;
    addDamageCharge.mutate(
      {
        rentalId,
        input: { amount: Number(amount), description: description.trim(), damageCategory: damageType, photos },
      },
      {
        onSuccess: () => {
          toastSuccess("Damage charge added");
          reset();
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Could not add damage charge"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Damage Charge</DialogTitle>
          <DialogDescription>Record damage found during vehicle inspection.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Damage Type</Label>
            <Select value={damageType} onValueChange={(v) => setDamageType(v as DamageCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="Select damage type" />
              </SelectTrigger>
              <SelectContent>
                {DAMAGE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Amount</Label>
            <Input
              type="number" min={0} value={amount} placeholder="₹"
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason / Description</Label>
            <Textarea
              value={description} rows={3}
              placeholder="Describe the damage found during vehicle inspection..."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Damage Photos</Label>
            <input
              type="file" multiple accept="image/jpeg,image/png"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={photos.length >= MAX_PHOTOS}
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {photos.map((file, i) => (
                  <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                    <img
                      src={URL.createObjectURL(file)} alt={`Damage photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[0.6875rem] text-muted-foreground">Up to {MAX_PHOTOS} JPEG/PNG photos.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || addDamageCharge.isPending} onClick={handleSubmit}>
            {addDamageCharge.isPending ? "Adding..." : "Add Damage Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
