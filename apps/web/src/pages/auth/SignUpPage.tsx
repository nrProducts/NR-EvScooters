import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthBrand } from "@/components/auth/AuthBrand";
import * as authApi from "@/services/api/staff";
import { ApiError } from "@/services/api/httpClient";
import { toastSuccess, toastError } from "@/lib/toastHelpers";

interface SignUpForm {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

/**
 * Public self-signup. Lands as a pending account (inactive, zero access) until
 * an admin approves it from Users → Awaiting approval and assigns it a role —
 * staff or rider. See apps/backend/src/modules/users/users.service.ts
 * selfSignUpStaff().
 */
export default function SignUpPage() {
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpForm>({
    defaultValues: { full_name: "", email: "", phone: "", password: "", confirmPassword: "" },
  });

  const signUp = useMutation({
    mutationFn: (values: SignUpForm) =>
      authApi.signUp({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
      }),
    onSuccess: () => { toastSuccess("Account created"); setDone(true); },
    onError: (err) => {
      // Map backend field errors onto the form so the offending input is
      // highlighted, instead of only the generic "correct the highlighted
      // fields" banner.
      const fields = err instanceof ApiError ? err.fields : undefined;
      const known: (keyof SignUpForm)[] = ["full_name", "email", "phone", "password"];
      let matched = false;
      if (fields) {
        for (const key of known) {
          if (fields[key]) {
            setError(key, { type: "server", message: fields[key] });
            matched = true;
          }
        }
      }
      if (!matched) toastError(err, "Could not create account");
    },
  });

  const onSubmit = (values: SignUpForm) => {
    signUp.mutate(values);
  };

  if (done) {
    return (
      <Card className="animate-fade-in overflow-hidden">
        <AuthBrand />
        <CardContent className="p-6 sm:p-8">
          <h1 className="mb-1 text-xl font-semibold">Account created</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            An administrator will review your registration and assign your access. Once approved, sign in with the
            email and password you just set.
          </p>
          <Link to="/login" className="text-sm font-medium text-primary hover:underline">
            Back to login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in overflow-hidden">
      <AuthBrand />
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Create an account</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your account starts with no access. An administrator reviews every registration and assigns your role —
          staff or rider — before you can sign in.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              placeholder="Full name"
              {...register("full_name", { required: "Full name is required" })}
            />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Email"
              {...register("email", { required: "Email is required" })}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="Phone"
              {...register("phone", { required: "Phone is required" })}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="pr-10"
                {...register("password", {
                  required: "A password is required",
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
                required: "Confirm your password",
                validate: (value, formValues) => value === formValues.password || "Passwords don't match",
              })}
            />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>

          {signUp.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {(signUp.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={signUp.isPending}>
            {signUp.isPending && <Spinner className="h-4 w-4" />}
            Create account
          </Button>

          <Link to="/login" className="block text-center text-sm font-medium text-primary hover:underline">
            Back to login
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
