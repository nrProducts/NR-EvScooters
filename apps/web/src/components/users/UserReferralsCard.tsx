import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchUserReferrals, type ReferralStatus, type UserReferralRow } from "@/services/api/referrals";
import { cn, formatDate, formatPhoneLocal } from "@/lib/utils";

const STATUS_STYLE: Record<ReferralStatus, string> = {
  qualified: "border-success/40 bg-success/10 text-success",
  pending: "border-warning/40 bg-warning/10 text-warning",
  rejected: "border-border bg-muted text-muted-foreground",
  revoked: "border-destructive/40 bg-destructive/10 text-destructive",
};

function ReferralPerson({ row }: { row: UserReferralRow }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5" title={`Code ${row.code_used}`}>
      <div className="flex min-w-0 items-baseline gap-2">
        <Link to={`/users/${row.person.id}`} className="truncate text-sm font-medium hover:underline">
          {row.person.full_name}
        </Link>
        <span className="shrink-0 text-xs text-muted-foreground">{formatPhoneLocal(row.person.phone) ?? "No phone"} · {formatDate(row.created_at)}</span>
      </div>
      <span className={cn("shrink-0 rounded-full border px-2 py-px text-[0.6875rem] font-medium capitalize", STATUS_STYLE[row.status])}>
        {row.status}
      </span>
    </li>
  );
}

/**
 * Where this user sits in the referral graph: the one person who referred them, and the people
 * they referred. Each name opens that user.
 */
export function UserReferralsCard({ userId }: { userId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["user-referrals", userId],
    queryFn: () => fetchUserReferrals(userId),
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4" /> Referrals
        </CardTitle>
        {data ? (
          <span className="text-xs text-muted-foreground">
            Referred {data.referred_count} · {data.qualified_count} qualified
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="p-4 pt-1 text-sm">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : isError || !data ? (
          <p className="text-xs text-muted-foreground">Couldn&apos;t load the referrals.</p>
        ) : (
          <div className="space-y-2">
            <div>
              <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Referred by</p>
              {data.referred_by ? (
                <ul><ReferralPerson row={data.referred_by} /></ul>
              ) : (
                <p className="py-1 text-xs text-muted-foreground">Not referred by anyone.</p>
              )}
            </div>
            <div className="border-t border-border pt-2">
              <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                Referred ({data.referred_count})
              </p>
              {data.referred.length === 0 ? (
                <p className="py-1 text-xs text-muted-foreground">Hasn&apos;t referred anyone yet.</p>
              ) : (
                <ul className="max-h-40 divide-y divide-border overflow-y-auto">
                  {data.referred.map((r) => <ReferralPerson key={r.id} row={r} />)}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
