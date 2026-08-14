import type { ReactNode } from "react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <MotionCard className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0 p-4 pb-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </MotionCard>
  );
}
