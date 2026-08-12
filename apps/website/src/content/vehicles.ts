/**
 * Sourced from the live public.vehicle_models / public.vendors rows (via
 * Supabase), not invented. This is a display-copy snapshot of that catalog
 * for the static site — when the model lineup changes, update here (or wire
 * this file up to the read-only `GET /vehicle-models` endpoint later, which
 * today requires rider auth and so can't be called from a public site).
 */
export interface VehicleModel {
  id: string;
  name: string;
  vendor: string;
  tagline: string;
  description: string;
  image: string;
  imageAlt: string;
  rangeKm: number;
  topSpeedKmph: number;
  batteryCapacity: string;
  motorPowerWatts: number;
  features: string[];
  safetyFeatures: string[];
}

export const VEHICLE_MODELS: VehicleModel[] = [
  {
    id: "mvs7",
    name: "MVS7",
    vendor: "Motovolt Mobility, in partnership with Indofast Energy",
    tagline: "Own it, Swap it and keep moving",
    description:
      "India's first multi-utility e-scooter, built on Indofast Energy's swappable battery network. A steel-frame, high-payload scooter designed for uninterrupted mobility — swap the battery instead of waiting to charge.",
    image: "https://jeerugpvchfjlgssfoeb.supabase.co/storage/v1/object/public/MobileApp-img/new-yellow-mvs7.webp",
    imageAlt: "MVS7 electric scooter, yellow, three-quarter front view",
    rangeKm: 85,
    topSpeedKmph: 50,
    batteryCapacity: "2.1 kWh, 48V Li-Ion — swappable in ~2 minutes",
    motorPowerWatts: 1500,
    features: [
      "5 riding modes: Eco, Power, Sport, Reverse, Cruise",
      "180 kg payload capacity",
      "Peak power 2.5 kW, peak torque 120 Nm",
      "Real-time telematics tracking",
      "Ergonomic seat with separate pillion seat",
      "5L boot storage",
      "Battery swap in ~2 minutes",
      "3-year / 30,000 km vehicle warranty",
    ],
    safetyFeatures: [
      "Combined Braking System (CBS) with regenerative braking",
      "130mm drum brakes, front and rear",
      "Telescopic front forks, adjustable rear suspension",
      "IP67 motor / IP65 display water & dust resistance",
      "Side-stand motor cut-off",
      "Full LED lighting",
    ],
  },
];
