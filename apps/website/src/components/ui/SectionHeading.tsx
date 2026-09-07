import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  /** Supports "\n" for a two-line headline, matching the hero's style. */
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  const lines = title.split("\n");

  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <Badge>{eyebrow}</Badge>}
      <h2 className="mt-4 text-balance text-section-mobile font-extrabold tracking-tight text-foreground sm:text-section">
        {lines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </h2>
      {description && (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
