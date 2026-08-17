import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import * as authApi from "@/services/api/staff";

export function useAuth() {
  const { user, setUser, logout: clearUser } = useAuthStore();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) =>
      authApi.login(identifier, password),
    onSuccess: (data) => {
      setUser(data);
      // Belt-and-suspenders alongside ProtectedRoute's own gate: an
      // instant redirect here beats waiting for a route-guard bounce off
      // /dashboard for an account still on its admin-issued temp password.
      navigate(data.mustChangePassword ? "/change-password" : "/dashboard", { replace: true });
    },
  });

  const signOut = () => {
    clearUser();
    navigate("/login", { replace: true });
    void authApi.logout();
  };

  return { user, isAuthenticated: !!user, login: loginMutation, signOut };
}
