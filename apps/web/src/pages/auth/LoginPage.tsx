import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";

interface LoginForm {
  identifier: string;
  password: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ defaultValues: { identifier: "", password: "" } });

  const onSubmit = (values: LoginForm) => {
    login.mutate(values);
  };

  return (
    <Card className="animate-fade-in">
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">Sign in to manage your fleet.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email or phone</Label>
            <Input
              id="identifier"
              placeholder="you@swapngo.in or +91 98765 43210"
              {...register("identifier", { required: "Email or phone is required" })}
            />
            {errors.identifier && <p className="text-xs text-destructive">{errors.identifier.message}</p>}
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
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => navigate("/forgot-password")}
            >
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

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Sign in with an admin or staff account provisioned in Supabase Auth. Riders should use the mobile app.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          New here?{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => navigate("/signup")}
          >
            Create an account
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
