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

interface ChangePasswordForm {
  password: string;
  confirmPassword: string;
}

export default function ChangePasswordPage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordForm>({ defaultValues: { password: "", confirmPassword: "" } });

  const changePassword = useMutation({
    mutationFn: (password: string) => authApi.confirmPasswordReset(password),
    onSuccess: () => {
      toastSuccess("Password changed");
      if (user) setUser({ ...user, mustChangePassword: false });
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => toastError(err, "Could not change password"),
  });

  const onSubmit = (values: ChangePasswordForm) => {
    changePassword.mutate(values.password);
  };

  return (
    <Card className="animate-fade-in overflow-hidden">
      <AuthBrand />
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Set a new password</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You signed in with a temporary password. Choose a new one to continue to the console.
        </p>

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

          {changePassword.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {(changePassword.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={changePassword.isPending}>
            {changePassword.isPending && <Spinner className="h-4 w-4" />}
            Set password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
