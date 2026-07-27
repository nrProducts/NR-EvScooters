import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { isRouteAllowed } from "./roleConfig";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isRouteAllowed(location.pathname, user.role)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
