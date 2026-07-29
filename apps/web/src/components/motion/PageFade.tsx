import type { ReactNode } from "react";
import { motion } from "framer-motion";

/** Wraps route content for a smooth fade + slide-up on every navigation. */
export function PageFade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
