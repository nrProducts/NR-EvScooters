import { useNavigate } from "react-router-dom";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { rentGateDecision } from "@/rider/lib/rentGate";

/** Shown on Home while the rider can't rent yet — mirrors the mobile KycBanner. */
export function KycBanner() {
  const navigate = useNavigate();
  const profile = useRiderAuthStore((s) => s.profile);
  if (!profile || profile.can_rent) return null;

  const decision = rentGateDecision(profile.kyc_status);
  const reviewing = profile.kyc_status === "pending" || profile.kyc_status === "partially_verified";

  return (
    <button
      onClick={() => navigate("/rider/kyc")}
      className="mb-4 flex w-full items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-left"
    >
      <ShieldCheck className="h-5 w-5 shrink-0 text-warning" />
      <div className="flex-1">
        <p className="text-sm font-semibold">{decision.title || "Verify your identity"}</p>
        <p className="text-xs text-muted-foreground">
          {decision.message || "Complete KYC to rent a scooter."}
        </p>
      </div>
      {!reviewing && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}
