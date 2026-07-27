import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import * as authApi from "@/services/api/staff";

export function useAuth() {
  const { user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      setUser(data);
      navigate("/dashboard", { replace: true });
    },
  });

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return { user, isAuthenticated: !!user, login: loginMutation, signOut };
}
