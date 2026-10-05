import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatDate, initials } from "@/lib/utils";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

/** No fetch here — reuses the session data useAuth() already holds from GET /auth/session. */
export default function MyProfilePage() {
  const { user } = useAuth();

  usePageSubtitle("Your account details");

  if (!user) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <CardHeader className="flex-row items-center gap-4 space-y-0">
          <Avatar className="h-16 w-16 ring-1 ring-border">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{user.name}</CardTitle>
            <Badge variant={user.role === "admin" ? "info" : "outline"} className="mt-1.5 capitalize">
              {user.role}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field label="Email" value={user.email || "—"} />
          <Field label="Phone" value={user.phone || "—"} />
          <Field label="Staff ID" value={user.staffCode || "—"} />
          <Field label="Joined" value={user.joinedOn ? formatDate(user.joinedOn) : "—"} />
        </CardContent>
      </Card>
    </div>
  );
}
