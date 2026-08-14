import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UserConsentCard } from "./UserConsentCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { useUser } from "@/hooks/useUsers";
import { initials, formatDate } from "@/lib/utils";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError, refetch } = useUser(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError || !user) return <ErrorState message="User not found." onRetry={() => refetch()} />;

  const address = [user.address_line_1, user.address_line_2, user.city, user.state, user.postal_code]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/users")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={user.profile_photo_url ?? undefined} alt={user.full_name} />
          <AvatarFallback>{initials(user.full_name || "?")}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.full_name || "Unnamed user"}</h1>
          <p className="text-sm text-muted-foreground">Joined {formatDate(user.created_at)}</p>
        </div>
        {user.roles.map((r) => <StatusBadge key={r} status={r} />)}
        <StatusBadge status={user.account_status} />
        <StatusBadge status={user.kyc_status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail icon={Phone} label="Phone" value={user.phone ?? "Not provided"} />
            <Detail icon={Mail} label="Email" value={user.email ?? "Not provided"} />
            <Detail icon={MapPin} label="Address" value={address || "Not provided"} />
            <Detail
              icon={Phone}
              label="Emergency contact"
              value={
                user.emergency_contact_name || user.emergency_contact_phone
                  ? `${user.emergency_contact_name ?? ""} ${user.emergency_contact_phone ?? ""}`.trim()
                  : "Not provided"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fleet &amp; plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Assigned vehicle"
              value={
                user.assigned_vehicle ? (
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => navigate(`/vehicles/${user.assigned_vehicle!.id}`)}
                  >
                    {user.assigned_vehicle.name}
                  </button>
                ) : (
                  "None"
                )
              }
            />
            <Row
              label="Current plan"
              value={user.current_plan ? `${user.current_plan.name} — ₹${user.current_plan.price.toFixed(0)}/${user.current_plan.billing_cycle}` : "None"}
            />
            <Row label="Payment status" value={user.payment_status ? <StatusBadge status={user.payment_status} /> : "—"} />
            <Row label="KYC completion" value={`${user.kyc_completion_percent}%`} />
            <Row label="Roles" value={user.roles.join(", ") || "—"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> KYC documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user.documents.length === 0 ? (
            <EmptyState title="No documents uploaded" description="This user hasn't submitted any KYC documents yet." />
          ) : (
            <div className="divide-y divide-border">
              {user.documents.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.doc_number_masked ?? "—"}
                      {doc.expiry_date ? ` · expires ${formatDate(doc.expiry_date)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={doc.verification_status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <UserConsentCard userId={user.id} />

      <p className="text-xs text-muted-foreground">
        Ride history and payment history aren't shown here — the backend doesn't expose an admin rentals or
        invoices endpoint yet (only a rider's own history, via <code>/rentals/me/history</code>).
      </p>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
