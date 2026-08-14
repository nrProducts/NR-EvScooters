import { ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { useUserConsents } from "@/hooks/useConsent";
import { CONSENT_PURPOSE_LABELS } from "@/types";
import { formatDateTime } from "@/lib/utils";

/**
 * A rider's consent state and its full history.
 *
 * Two things ops actually need from this: whether the rider currently permits
 * what we are about to do, and — when a complaint arrives — exactly what they
 * agreed to and when. The history is append-only in the database, so what is
 * shown here is the whole record, not a summary of it.
 */
export function UserConsentCard({ userId }: { userId: string }) {
  const { data, isLoading, isError } = useUserConsents(userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Consent
        </CardTitle>
        <CardDescription>
          What this rider has agreed to, and against which version of the privacy notice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : isError || !data ? (
          <EmptyState title="Could not load consent" description="The consent service did not respond." />
        ) : (
          <div className="space-y-4">
            {!data.up_to_date && (
              <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  This rider has not accepted the current notice ({data.current_notice_version}). They
                  will be asked to review it the next time they open the app, and identity-document
                  uploads are refused until they do.
                </p>
              </div>
            )}

            <div className="divide-y divide-border">
              {data.items.map((item) => (
                <div key={item.purpose} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {item.required && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    <span className="truncate font-medium">
                      {CONSENT_PURPOSE_LABELS[item.purpose]}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={
                        item.granted
                          ? "text-xs font-medium text-success"
                          : "text-xs font-medium text-muted-foreground"
                      }
                    >
                      {item.granted ? "Granted" : item.decided_at ? "Withdrawn" : "Not asked"}
                    </span>
                    {item.decided_at && (
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(item.decided_at)}
                        {item.notice_version ? ` · v${item.notice_version}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {data.history.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Full history ({data.history.length} {data.history.length === 1 ? "entry" : "entries"})
                </summary>
                <div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto">
                  {data.history.map((h) => (
                    <div key={h.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {CONSENT_PURPOSE_LABELS[h.purpose]} · {h.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          v{h.notice_version} · {h.language.toUpperCase()} · {h.source}
                          {/* Named explicitly: a decision a staff member entered
                              on the rider's behalf is weaker evidence than one
                              the rider made themselves, and a reviewer has to
                              be able to tell them apart. */}
                          {h.recorded_by ? ` · recorded by ${h.recorded_by.full_name}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(h.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
