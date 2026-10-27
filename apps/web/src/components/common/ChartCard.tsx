import type { ReactNode } from "react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
  fill = false,
  still = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Let the body take whatever height the card has. For a card that sits in a grid row beside
   * a taller neighbour (it is stretched to match): the content can then grow instead of
   * leaving empty space underneath. Give the child `flex-1` to use it.
   */
  fill?: boolean;
  /**
   * No hover lift / zoom. For a card that holds something you interact with (a map: the card
   * growing under the cursor makes panning and clicking markers jumpy).
   */
  still?: boolean;
}) {
  return (
    <MotionCard className={cn(className, fill && "flex flex-col")} whileHover={still ? undefined : { y: -5, scale: 1.02 }}>
      <CardHeader className="flex-row items-start justify-between space-y-0 p-4 pb-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn("p-4 pt-0", fill && "flex flex-1 flex-col")}>{children}</CardContent>
    </MotionCard>
  );
}
