import { useQuery } from "@/lib/useQuery";
import { fetchVehicleModelOptions } from "@/services/api/vehicleModels";

export function useVehicleModelOptions() {
  return useQuery({ queryKey: ["vehicle-model-options"], queryFn: fetchVehicleModelOptions });
}
