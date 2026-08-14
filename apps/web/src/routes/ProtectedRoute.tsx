import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { isRouteAllowedForUser } from "./roleConfig";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isRouteAllowedForUser(location.pathname, user)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
