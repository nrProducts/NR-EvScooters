import type { LucideIcon } from "lucide-react";
import { PlugZap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function NotConnected({
  title,
  description,
  missingEndpoints,
  icon: Icon = PlugZap,
}: {
  title: string;
  description: string;
  missingEndpoints?: string[];
  icon?: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {missingEndpoints && missingEndpoints.length > 0 && (
          <div className="mt-2 rounded-lg border border-dashed border-border px-4 py-3 text-left">
            <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
              Would need
            </p>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              {missingEndpoints.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
