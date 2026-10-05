import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthBrand } from "@/components/auth/AuthBrand";
import { useAuthStore } from "@/store/authStore";
import * as authApi from "@/services/api/staff";
import { toastSuccess, toastError } from "@/lib/toastHelpers";

interface ResetPasswordForm {
  password: string;
  confirmPassword: string;
}

/**
 * Lands from the emailed reset link. Supabase's client auto-establishes a
 * recovery session from the URL (detectSessionInUrl, on by default) before
 * this mounts, so submitting just needs updateUser + a fresh /auth/session
 * read to hydrate the console's own auth store.
 */
export default function ResetPasswordPage() {
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({ defaultValues: { password: "", confirmPassword: "" } });

  const resetPassword = useMutation({
    mutationFn: async (password: string) => {
      await authApi.confirmPasswordReset(password);
      return authApi.resolveStaffSession();
    },
    onSuccess: (user) => {
      toastSuccess("Password reset");
      setUser(user);
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => toastError(err, "Could not reset password"),
  });

  const onSubmit = (values: ResetPasswordForm) => {
    resetPassword.mutate(values.password);
  };

  return (
    <Card className="animate-fade-in overflow-hidden">
      <AuthBrand />
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
        <p className="mb-6 text-sm text-muted-foreground">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="pr-10"
                {...register("password", {
                  required: "A new password is required",
                  minLength: { value: 8, message: "Use at least 8 characters" },
                })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              {...register("confirmPassword", {
                required: "Confirm your new password",
                validate: (value, formValues) => value === formValues.password || "Passwords don't match",
              })}
            />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>

          {resetPassword.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {(resetPassword.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
            {resetPassword.isPending && <Spinner className="h-4 w-4" />}
            Set password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
