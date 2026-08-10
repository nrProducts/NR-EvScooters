import { useQuery } from "@tanstack/react-query";
import { fetchVehicleModelOptions } from "@/services/api/vehicleModels";

export function useVehicleModelOptions() {
  return useQuery({ queryKey: ["vehicle-model-options"], queryFn: fetchVehicleModelOptions });
}
