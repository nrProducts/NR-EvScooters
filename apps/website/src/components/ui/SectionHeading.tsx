import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
  headingLevel = 2,
}: {
  eyebrow?: string;
  /** Supports "\n" for a two-line headline, matching the hero's style. */
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
  /** Use 1 only when this heading is the page's single <h1>. */
  headingLevel?: 1 | 2;
}) {
  const lines = title.split("\n");
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <Badge>{eyebrow}</Badge>}
      <Heading className="mt-4 text-balance text-section-mobile font-semibold text-foreground sm:text-section">
        {lines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </Heading>
      {description && (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
