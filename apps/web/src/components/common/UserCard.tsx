import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { initials } from "@/lib/utils";
import type { Rider } from "@/types";

export function UserCard({ rider, onClick }: { rider: Rider; onClick?: () => void }) {
  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-soft" onClick={onClick}>
      <CardContent className="flex items-center gap-3 p-4">
        <Avatar>
          <AvatarImage src={rider.avatarUrl} alt={rider.name} />
          <AvatarFallback>{initials(rider.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{rider.name}</p>
          <p className="truncate text-xs text-muted-foreground">{rider.phone}</p>
        </div>
        <StatusBadge status={rider.kycStatus} />
      </CardContent>
    </Card>
  );
}
