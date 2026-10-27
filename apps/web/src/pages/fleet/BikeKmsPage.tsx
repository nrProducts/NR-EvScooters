import { Navigate } from "react-router-dom";

/**
 * Bike KMs now lives inside the Vehicles screen (the "Bike KMs" toggle). This
 * route stays only so old links and bookmarks keep working.
 */
export default function BikeKmsPage() {
  return <Navigate to="/vehicles?view=kms" replace />;
}
