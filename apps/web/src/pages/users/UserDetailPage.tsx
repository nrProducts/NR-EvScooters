import { useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, PlusCircle, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/users/UserAvatar";
import { UserDocumentsCard } from "@/components/users/UserDocumentsCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UserConsentCard } from "./UserConsentCard";
import { AddChargeDialog } from "@/components/users/AddChargeDialog";
import { RiderOriginalsCard } from "@/components/users/RiderOriginalsCard";
import { UserReferralsCard } from "@/components/users/UserReferralsCard";
import { ErrorState } from "@/components/common/ErrorState";
import { useUser } from "@/hooks/useUsers";
import { useAuthStore } from "@/store/authStore";
import { hasAction } from "@/lib/permissions";
import { formatDate, formatCurrency, formatPhoneLocal } from "@/lib/utils";
import { usePageOwnsTitle } from "@/hooks/usePageOwnsTitle";

export default function UserDetailPage() {
  usePageOwnsTitle(); // this page draws its own heading; hide the header's
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError, refetch } = useUser(id);
  const viewer = useAuthStore((s) => s.user);
  const [chargeOpen, setChargeOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError || !user) return <ErrorState message="User not found." onRetry={() => refetch()} />;

  const address = [user.address_line_1, user.address_line_2, user.city, user.state, user.postal_code]
    .filter(Boolean)
    .join(", ");
  const emergency =
    user.emergency_contact_name || user.emergency_contact_phone
      ? `${user.emergency_contact_name ?? ""} ${formatPhoneLocal(user.emergency_contact_phone) ?? ""}`.trim()
      : "Not provided";
  const isRider = user.role === "rider";

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/users")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <UserAvatar user={user} className="h-12 w-12" fallbackClassName="text-sm" />
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold leading-tight tracking-tight">{user.full_name || "Unnamed user"}</h1>
          <span className="text-xs text-muted-foreground">Joined {formatDate(user.created_at)}</span>
        </div>
        <StatusBadge status={user.role} />
        <StatusBadge status={user.account_status} />
        <StatusBadge status={user.kyc_status} />

        {isRider && hasAction(viewer, "payments", "refund") && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setChargeOpen(true)}>
            <PlusCircle className="h-3.5 w-3.5" /> Add Charge
          </Button>
        )}
      </div>

      {isRider && (
        <AddChargeDialog
          userId={user.id}
          riderName={user.full_name || "this rider"}
          open={chargeOpen}
          onOpenChange={setChargeOpen}
        />
      )}

      {/* Row 1: who they are, and where they stand with us. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 pt-1 sm:grid-cols-2">
            <Detail icon={Phone} label="Phone" value={formatPhoneLocal(user.phone) ?? "Not provided"} />
            <Detail icon={Mail} label="Email" value={user.email ?? "Not provided"} />
            <Detail icon={MapPin} label="Address" value={address || "Not provided"} />
            <Detail icon={Phone} label="Emergency contact" value={emergency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Fleet &amp; plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-4 pt-1 text-sm">
            <Row
              label="Vehicle"
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
              label="Plan"
              value={user.current_plan ? `${user.current_plan.name} — ₹${user.current_plan.price.toFixed(0)}/${user.current_plan.billing_cycle}` : "None"}
            />
            {/* An open return is its own row here rather than replacing the
                plan status: staff opening this record need the return surfaced
                explicitly — it is the thing waiting on them. Same fact the Users
                grid folds into its Payment column. */}
            {user.open_return ? (
              <Row
                label="Return"
                value={<StatusBadge status={user.open_return.status === "inspected" ? "inspected" : "return_requested"} />}
              />
            ) : null}
            <Row label="Payment" value={user.payment_status ? <StatusBadge status={user.payment_status} /> : "—"} />
            <Row
              label="Outstanding"
              value={user.outstanding_amount > 0
                ? <span className="font-semibold text-destructive">{formatCurrency(user.outstanding_amount)}</span>
                : "₹0"}
            />
            <Row label="KYC completion" value={`${user.kyc_completion_percent}%`} />
          </CardContent>
        </Card>
      </div>

      {/* Row 2: referrals and the originals we hold, side by side. */}
      {isRider && (
        <div className="grid gap-3 md:grid-cols-2">
          <UserReferralsCard userId={user.id} />
          <RiderOriginalsCard userId={user.id} />
        </div>
      )}

      {/* Row 3: KYC documents and consent, side by side. */}
      <div className="grid gap-3 md:grid-cols-2">
        <UserDocumentsCard
          userId={user.id}
          fullName={user.full_name}
          hasPhoto={!!user.profile_photo_url}
          documents={user.documents}
        />
        <UserConsentCard userId={user.id} />
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
