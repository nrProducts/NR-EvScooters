import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { isRouteAllowedForUser } from "./roleConfig";

const CHANGE_PASSWORD_PATH = "/change-password";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // A staff account still on its admin-issued temporary password is locked
  // to this one route until they set their own — checked before the nav
  // permission gate below, since /change-password isn't a NAV_ITEMS module
  // and would otherwise 403 for everyone.
  if (user.mustChangePassword) {
    return location.pathname === CHANGE_PASSWORD_PATH
      ? <>{children}</>
      : <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  if (location.pathname === CHANGE_PASSWORD_PATH) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isRouteAllowedForUser(location.pathname, user)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
