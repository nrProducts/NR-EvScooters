import { useState } from "react";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/services/api/httpClient";

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ defaultValues: { email: "", password: "" } });

  const onSubmit = (values: LoginForm) => {
    login.mutate(values);
  };

  const onGoogleClick = () => {
    setGoogleError(null);
    loginWithGoogle.mutate(undefined, {
      onError: (err) => {
        setGoogleError(err instanceof ApiError ? err.message : "Could not start Google sign-in.");
      },
    });
  };

  return (
    <Card className="animate-fade-in">
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">Sign in to manage your fleet.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@swapngo.in"
              {...register("email", { required: "Email is required" })}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="pr-10"
                {...register("password", { required: "Password is required" })}
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

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={rememberMe} onCheckedChange={setRememberMe} />
              Remember me
            </label>
            <button type="button" className="text-sm font-medium text-primary hover:underline">
              Forgot password?
            </button>
          </div>

          {login.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {(login.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Login
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {googleError && (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{googleError}</p>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onGoogleClick}
          disabled={loginWithGoogle.isPending}
        >
          {loginWithGoogle.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="flex h-4 w-4 items-center justify-center rounded-full border bg-white text-[10px] font-black text-[#4285F4]">
              G
            </span>
          )}
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Sign in with an admin or staff account provisioned in Supabase Auth. Riders should use the mobile app.
        </p>
      </CardContent>
    </Card>
  );
}
