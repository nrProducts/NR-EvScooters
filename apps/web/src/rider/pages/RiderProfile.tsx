import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, LogOut, ShieldCheck, Bike, CreditCard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toastError } from "@/lib/toastHelpers";
import { CenteredSpinner, StatusPill } from "@/rider/components/common";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { useMyPhotoUrl } from "@/rider/hooks/queries";
import { riderApi } from "@/rider/services/riderApi";
import { KYC_STATUS_LABEL, KYC_STATUS_TONE } from "@/rider/constants/status";

const MAX_BYTES = 10 * 1024 * 1024;

export default function RiderProfile() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useRiderAuthStore((s) => s.profile);
  const refreshProfile = useRiderAuthStore((s) => s.refreshProfile);
  const signOut = useRiderAuthStore((s) => s.signOut);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { data: photoUrl } = useMyPhotoUrl(!!profile?.profile_photo_url);

  if (!profile) return <CenteredSpinner />;

  const onPickPhoto = async (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toastError(new Error("Use a JPG or PNG image."), "Invalid file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toastError(new Error("Image must be under 10 MB."), "File too large");
      return;
    }
    setUploading(true);
    try {
      await riderApi.uploadMyPhoto(file);
      await refreshProfile();
      await qc.invalidateQueries({ queryKey: ["rider", "photo-url"] });
      qc.invalidateQueries({ queryKey: ["rider"] });
    } catch (err) {
      toastError(err, "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div>
      <div className="mb-6 flex flex-col items-center">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-secondary"
        >
          {profile.profile_photo_url && photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => e.target.files?.[0] && onPickPhoto(e.target.files[0])}
        />
        {uploading && <p className="mt-2 text-xs text-muted-foreground">Uploading…</p>}
        <p className="mt-3 text-base font-bold">{profile.full_name}</p>
        <p className="text-xs text-muted-foreground">{profile.email || profile.phone}</p>
      </div>

      <Card className="mb-4">
        <CardContent className="flex items-center justify-between p-4">
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> KYC status
          </span>
          <StatusPill tone={KYC_STATUS_TONE[profile.kyc_status]}>
            {KYC_STATUS_LABEL[profile.kyc_status]}
          </StatusPill>
        </CardContent>
      </Card>

      {!profile.can_rent && (
        <Button variant="outline" className="mb-4 w-full" onClick={() => navigate("/rider/kyc")}>
          Verify your identity <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {profile.assigned_vehicle && (
        <Card className="mb-3">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <Bike className="h-4 w-4 text-primary" />
            <div>
              <p className="font-semibold">{profile.assigned_vehicle.model}</p>
              <p className="text-xs text-muted-foreground">{profile.assigned_vehicle.vin}</p>
            </div>
          </CardContent>
        </Card>
      )}
      {profile.current_plan && (
        <Card className="mb-3">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <CreditCard className="h-4 w-4 text-primary" />
            <div>
              <p className="font-semibold">{profile.current_plan.name}</p>
              <p className="text-xs capitalize text-muted-foreground">{profile.current_plan.status}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Button variant="ghost" className="mt-6 w-full text-destructive" onClick={handleSignOut}>
        <LogOut className="h-4 w-4" /> Log out
      </Button>
    </div>
  );
}
