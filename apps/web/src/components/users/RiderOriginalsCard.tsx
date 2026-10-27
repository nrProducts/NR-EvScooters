import { useQuery } from "@tanstack/react-query";
import { FileCheck2, FileX2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRiderOriginals } from "@/services/api/originals";
import { cn, formatFullDateTime } from "@/lib/utils";

/**
 * The original documents Swapngo took from this rider at each pickup — or that
 * none were. Newest pickup first. What is currently held is called out at the top.
 */
export function RiderOriginalsCard({ userId }: { userId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["rider-originals", userId],
    queryFn: () => fetchRiderOriginals(userId),
    staleTime: 60_000,
  });

  const held = (data ?? []).flatMap((r) => r.documents.filter((d) => d.status === "held"));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCheck2 className="h-4 w-4" /> Original documents
        </CardTitle>
        {data && data.length > 0 ? (
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium",
              held.length > 0 ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-muted text-muted-foreground",
            )}
          >
            {held.length > 0 ? `${held.length} held` : "None held"}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-1 text-sm">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : isError ? (
          <p className="text-xs text-muted-foreground">Couldn&apos;t load the original documents.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing recorded yet. Originals are recorded when a scooter is handed over (Confirm pickup).
          </p>
        ) : (
          data.map((r) => (
            <div key={r.rental_id} className="rounded-lg border border-border p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  {r.taken ? <FileCheck2 className="h-3.5 w-3.5 text-warning" /> : <FileX2 className="h-3.5 w-3.5 text-muted-foreground" />}
                  {r.taken ? "Originals taken at pickup" : "No originals taken at pickup"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFullDateTime(r.recorded_at)}{r.recorded_by ? ` · ${r.recorded_by.full_name}` : ""}
                </p>
              </div>
              {r.documents.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {r.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <span className="font-medium">{d.label}</span>
                      <span className={cn("text-xs", d.status === "held" ? "text-warning" : "text-muted-foreground")}>
                        {d.status === "held" ? "Held" : `Returned${d.returned_at ? ` ${formatFullDateTime(d.returned_at)}` : ""}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
