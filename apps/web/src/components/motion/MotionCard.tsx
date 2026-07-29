import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MotionCardBase = motion.create(Card);

/** Card with the brief's signature hover: lift 5px, scale 1.02, 250ms ease. */
export const MotionCard = React.forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(
  ({ className, ...props }, ref) => (
    <MotionCardBase
      ref={ref}
      className={cn("hover:bg-card-hover", className)}
      whileHover={{ y: -5, scale: 1.02 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      {...props}
    />
  ),
);
MotionCard.displayName = "MotionCard";
