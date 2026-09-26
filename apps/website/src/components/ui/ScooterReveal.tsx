import { useState } from "react";
import { ScooterIllustration } from "@/components/ui/ScooterIllustration";
import { cn } from "@/lib/utils";

/**
 * The hero scooter photo's entrance: a plain black-and-white pass draws in
 * left to right, a glowing scan line sweeps across it, and the full-colour
 * photo is left behind. Two stacked <ScooterIllustration>s do the work — one
 * grayscale via CSS filter, one plain — wiped in with clip-path (see the
 * sg-* keyframes in index.css). Click or press Enter/Space to replay: the
 * `key` remount is what restarts every animation at once.
 */
export function ScooterReveal({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  const [replayKey, setReplayKey] = useState(0);
  const replay = () => setReplayKey((k) => k + 1);

  return (
    <div
      key={replayKey}
      onClick={replay}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          replay();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Replay the scooter animation"
      className={cn("group relative cursor-pointer", className)}
    >
      {/* A quiet green pulse behind the photo — confirms the tap registered
          on replay, not just decoration on first load. */}
      <span
        aria-hidden
        className="sg-ring pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[75%] rounded-full border-2 border-primary opacity-0"
      />

      {/* Plain black and white — no colour tint. Brightness stays under 1
          (unlike a naive grayscale+brightness-boost combo) so a mostly-light
          product photo doesn't blow out toward white; contrast alone gives
          it the sketch-like definition. */}
      <div
        className="sg-sketch absolute inset-0 h-full w-full"
        style={{ filter: "grayscale(1) contrast(1.3) brightness(0.92)" }}
      >
        <ScooterIllustration className="h-full w-full" priority={priority} />
      </div>
      <ScooterIllustration className="sg-color relative h-full w-full" priority={priority} />

      <span
        aria-hidden
        className="sg-scanline pointer-events-none absolute bottom-0 top-0 w-[3px] rounded-full bg-primary"
        style={{ boxShadow: "0 0 18px hsl(var(--primary))" }}
      />
    </div>
  );
}
