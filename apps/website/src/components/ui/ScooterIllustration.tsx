/**
 * Original flat-vector scooter illustration — a placeholder standing in for
 * a real product photo, drawn inline so there's no external asset to
 * license. Built from simple aligned primitives (rects + circles) rather
 * than a hand-tuned silhouette path, deliberately — keeps it crisp at any
 * size. Swap it for a real shot in Hero.tsx / Vehicles.tsx whenever one is
 * available.
 */
export function ScooterIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-label="Illustration of an electric scooter"
    >
      <defs>
        <linearGradient id="scooterGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(220 14% 93%)" />
          <stop offset="100%" stopColor="hsl(220 14% 97%)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="400" height="300" fill="url(#scooterGround)" />
      <ellipse cx="205" cy="248" rx="135" ry="11" fill="hsl(220 14% 87%)" />

      {/* handlebar */}
      <rect x="248" y="80" width="72" height="9" rx="4.5" fill="hsl(215 28% 17%)" />
      <rect x="281" y="86" width="9" height="42" rx="4.5" fill="hsl(215 28% 17%)" />

      {/* front leg shield */}
      <rect x="266" y="118" width="40" height="94" rx="18" fill="hsl(215 28% 17%)" />
      <circle cx="286" cy="140" r="8" fill="hsl(210 40% 98%)" />

      {/* main body */}
      <rect x="138" y="150" width="150" height="52" rx="26" fill="hsl(142 71% 38%)" />
      <path d="M162 170 L252 182" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />

      {/* seat */}
      <rect x="148" y="132" width="76" height="22" rx="11" fill="hsl(215 28% 17%)" />

      {/* deck */}
      <rect x="108" y="196" width="204" height="18" rx="9" fill="hsl(215 28% 17%)" />

      {/* rear wheel */}
      <circle cx="128" cy="216" r="32" fill="hsl(215 28% 17%)" />
      <circle cx="128" cy="216" r="12" fill="hsl(220 14% 93%)" />

      {/* front wheel */}
      <circle cx="296" cy="216" r="32" fill="hsl(215 28% 17%)" />
      <circle cx="296" cy="216" r="12" fill="hsl(220 14% 93%)" />
    </svg>
  );
}
