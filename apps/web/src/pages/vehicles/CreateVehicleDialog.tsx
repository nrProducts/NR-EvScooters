import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateVehicle } from "@/hooks/useVehicles";

interface FormValues {
  registrationNumber: string;
  vin: string;
  imei: string;
  model: string;
  station: string;
}

export function CreateVehicleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const createVehicle = useCreateVehicle();
  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { registrationNumber: "", vin: "", imei: "", model: "Motovolt MVS7", station: "Sholinganallur" },
  });

  const onSubmit = (values: FormValues) => {
    createVehicle.mutate(values, {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a vehicle</DialogTitle>
          <DialogDescription>Register a new scooter into the fleet inventory.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Registration number</Label>
              <Input placeholder="TN09AB1234" {...register("registrationNumber", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input {...register("model", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>VIN</Label>
              <Input {...register("vin", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>IMEI (GPS unit)</Label>
              <Input {...register("imei", { required: true })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Home station</Label>
              <Input {...register("station")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createVehicle.isPending}>
              {createVehicle.isPending ? "Saving..." : "Add vehicle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
