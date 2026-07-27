import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { useRider } from "@/hooks/useRiders";
import { initials, formatDate } from "@/lib/utils";

export default function RiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rider, isLoading, isError, refetch } = useRider(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError || !rider) return <ErrorState message="Rider not found." onRetry={() => refetch()} />;

  const address = [rider.address_line_1, rider.address_line_2, rider.city, rider.state, rider.postal_code]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/riders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={rider.profile_photo_url ?? undefined} alt={rider.full_name} />
          <AvatarFallback>{initials(rider.full_name || "?")}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{rider.full_name || "Unnamed rider"}</h1>
          <p className="text-sm text-muted-foreground">Joined {formatDate(rider.created_at)}</p>
        </div>
        <StatusBadge status={rider.account_status} />
        <StatusBadge status={rider.kyc_status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail icon={Phone} label="Phone" value={rider.phone ?? "Not provided"} />
            <Detail icon={Mail} label="Email" value={rider.email ?? "Not provided"} />
            <Detail icon={MapPin} label="Address" value={address || "Not provided"} />
            <Detail
              icon={Phone}
              label="Emergency contact"
              value={
                rider.emergency_contact_name || rider.emergency_contact_phone
                  ? `${rider.emergency_contact_name ?? ""} ${rider.emergency_contact_phone ?? ""}`.trim()
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
            <Row label="Assigned vehicle" value={rider.assigned_vehicle ? `${rider.assigned_vehicle.model} (${rider.assigned_vehicle.vin})` : "None"} />
            <Row label="Current plan" value={rider.current_plan ? `${rider.current_plan.name} (${rider.current_plan.status})` : "None"} />
            <Row label="KYC completion" value={`${rider.kyc_completion_percent}%`} />
            <Row label="Roles" value={rider.roles.join(", ") || "—"} />
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
          {rider.documents.length === 0 ? (
            <EmptyState title="No documents uploaded" description="This rider hasn't submitted any KYC documents yet." />
          ) : (
            <div className="divide-y divide-border">
              {rider.documents.map((doc) => (
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
