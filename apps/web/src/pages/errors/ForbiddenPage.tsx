import { useNavigate } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldOff className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Access restricted</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your staff account doesn't have permission to view this page.</p>
      </div>
      <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
    </div>
  );
}
