import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Spinner } from "@/components/common/Spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthBrand } from "@/components/auth/AuthBrand";
import * as authApi from "@/services/api/staff";
import { toastSuccess, toastError } from "@/lib/toastHelpers";

interface ForgotPasswordForm {
  email: string;
}

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({ defaultValues: { email: "" } });

  const requestReset = useMutation({
    mutationFn: (email: string) => authApi.requestPasswordReset(email),
    onSuccess: (_data, email) => { toastSuccess("Reset link sent"); setSentTo(email); },
    onError: (err) => toastError(err, "Could not send reset link"),
  });

  const onSubmit = (values: ForgotPasswordForm) => {
    requestReset.mutate(values.email);
  };

  if (sentTo) {
    return (
      <Card className="animate-fade-in overflow-hidden">
        <AuthBrand />
        <CardContent className="p-6 sm:p-8">
          <h1 className="mb-1 text-xl font-semibold">Check your email</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            If an account exists for {sentTo}, we've sent a link to reset its password.
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
        <h1 className="mb-1 text-xl font-semibold">Forgot password</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Enter the email on your account and we'll send you a link to reset your password.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          {requestReset.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {(requestReset.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={requestReset.isPending}>
            {requestReset.isPending && <Spinner className="h-4 w-4" />}
            Send reset link
          </Button>

          <Link to="/login" className="block text-center text-sm font-medium text-primary hover:underline">
            Back to login
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
