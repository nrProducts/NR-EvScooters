import { cn } from "@/lib/utils";

/** The small uppercase pill used for eyebrows, "Most popular", step tags, etc. */
export function Badge({
  children,
  className,
  tone = "soft",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "soft" | "outline" | "dark";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]",
        tone === "soft" && "bg-secondary text-secondary-foreground",
        tone === "outline" && "border border-primary/25 bg-primary/5 text-primary",
        tone === "dark" && "border border-white/15 bg-white/10 text-white backdrop-blur",
        className,
      )}
    >
      {children}
    </span>
  );
}
