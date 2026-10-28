import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserPhotoUrl } from "@/hooks/useUsers";
import { useAuthStore } from "@/store/authStore";
import { hasAction } from "@/lib/permissions";
import { cn, initials } from "@/lib/utils";

/**
 * A user's photo, or their initials when there is none (or the viewer may not see it).
 *
 * Photos sit in a private bucket and `profile_photo_url` is only a storage path, so the picture is
 * fetched as a signed URL. That route is audited, and — like the "Rider photo" button in the KYC
 * review — it is only used for staff who hold the KYC document-viewing permission.
 */
export function UserAvatar({
  user,
  className,
  fallbackClassName,
}: {
  user: { id: string; full_name: string; profile_photo_url: string | null };
  className?: string;
  fallbackClassName?: string;
}) {
  const canSee = useAuthStore((s) => hasAction(s.user, "kyc", "reveal_number"));
  const stored = user.profile_photo_url;
  // Some accounts may already hold a full URL; only a bare storage path needs signing.
  const isPath = !!stored && !/^https?:\/\//i.test(stored);
  const { data } = useUserPhotoUrl(user.id, canSee && isPath);
  const src = isPath ? data?.url : stored ?? undefined;

  return (
    <Avatar className={cn("h-8 w-8", className)}>
      <AvatarImage src={src} alt={user.full_name} className="object-cover" />
      <AvatarFallback className={fallbackClassName}>{initials(user.full_name || "?")}</AvatarFallback>
    </Avatar>
  );
}
