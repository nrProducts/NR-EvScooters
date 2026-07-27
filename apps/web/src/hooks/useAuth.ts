import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import * as authApi from "@/services/api/staff";

export function useAuth() {
  const { user, setUser, logout: clearUser } = useAuthStore();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      setUser(data);
      navigate("/dashboard", { replace: true });
    },
  });

  const googleLoginMutation = useMutation({
    mutationFn: () => authApi.loginWithGoogle(),
    // No onSuccess navigation here — this call only redirects to Google;
    // the actual session/role resolution happens on /auth/callback.
  });

  const signOut = () => {
    clearUser();
    navigate("/login", { replace: true });
    void authApi.logout();
  };

  return { user, isAuthenticated: !!user, login: loginMutation, loginWithGoogle: googleLoginMutation, signOut };
}
