import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      // 20px gutters on phones (48px of a 320px screen was too much to give
      // away), widening to 24px once there is room for it.
      padding: { DEFAULT: "1.25rem", sm: "1.5rem" },
    },
    extend: {
      fontFamily: {
        sans: ["Outfit Variable", "Outfit", ...defaultTheme.fontFamily.sans],
        /** Handwritten accent — single expressive words inside headings, and testimonial signatures. */
        script: ["Reenie Beanie", "cursive"],
      },
      fontSize: {
        // The scale runs at 90% of its "natural" size — text only, not
        // spacing/icons/radius, which stay off Tailwind's default rem scale
        // here so they're unaffected. The two smallest steps are the
        // exception: they sit at 12px/13px rather than 90% (10.8px/12.6px),
        // because below ~12px labels and captions stop being comfortably
        // readable on a phone.
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.15rem" }],
        base: ["0.9rem", { lineHeight: "1.35rem" }],
        lg: ["1.0125rem", { lineHeight: "1.575rem" }],
        xl: ["1.125rem", { lineHeight: "1.575rem" }],
        "2xl": ["1.35rem", { lineHeight: "1.8rem" }],
        "3xl": ["1.6875rem", { lineHeight: "2.025rem" }],
        "4xl": ["2.025rem", { lineHeight: "2.25rem" }],
        "5xl": ["2.7rem", { lineHeight: "1" }],
        "6xl": ["3.375rem", { lineHeight: "1" }],
        "7xl": ["4.05rem", { lineHeight: "1" }],
        "8xl": ["5.4rem", { lineHeight: "1" }],
        "9xl": ["7.2rem", { lineHeight: "1" }],

        // Headings are fluid rather than stepped: one clamp() each covers
        // 320px through 1280px+, so a headline never jumps at a breakpoint
        // and never has to re-wrap awkwardly between them. The -mobile /
        // -lg names are kept so the existing responsive classes still
        // resolve; they now evaluate to the same fluid value everywhere.
        "hero-mobile": ["clamp(2.25rem, 1.55rem + 3.4vw, 4.05rem)", { lineHeight: "1.06", letterSpacing: "-0.025em" }],
        hero: ["clamp(2.25rem, 1.55rem + 3.4vw, 4.05rem)", { lineHeight: "1.06", letterSpacing: "-0.025em" }],
        "hero-lg": ["clamp(2.25rem, 1.55rem + 3.4vw, 4.05rem)", { lineHeight: "1.06", letterSpacing: "-0.025em" }],
        "section-mobile": ["clamp(1.7rem, 1.35rem + 1.8vw, 2.475rem)", { lineHeight: "1.12", letterSpacing: "-0.025em" }],
        section: ["clamp(1.7rem, 1.35rem + 1.8vw, 2.475rem)", { lineHeight: "1.12", letterSpacing: "-0.025em" }],
      },
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: "hsl(var(--surface))",
        sage: "hsl(var(--sage))",
        mist: "hsl(var(--mist))",
        dark: "hsl(var(--dark))",
        "near-black": "hsl(var(--near-black))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 6px)",
        sm: "calc(var(--radius) - 10px)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 14px)",
        "3xl": "calc(var(--radius) + 22px)",
      },
      boxShadow: {
        // Deliberately shallow — the design leans on tint and radius for depth, not drop shadows.
        soft: "0 4px 20px -2px rgb(0 0 0 / 0.05)",
        card: "0 8px 30px -4px rgb(0 0 0 / 0.06)",
        lift: "0 16px 40px -8px rgb(0 0 0 / 0.08)",
        glow: "0 0 0 1px hsl(142 71% 45% / 0.12), 0 20px 60px -12px hsl(142 71% 45% / 0.28)",
      },
      keyframes: {
        // Background blobs: a 10px rise and fall, slow enough to read as drift rather than movement.
        blob: {
          "0%, 100%": { transform: "translateY(-10px)" },
          "50%": { transform: "translateY(10px)" },
        },
      },
      animation: {
        blob: "blob 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
