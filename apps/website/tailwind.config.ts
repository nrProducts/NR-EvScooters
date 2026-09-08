import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
    },
    extend: {
      fontFamily: {
        sans: ["Manrope Variable", "Manrope", ...defaultTheme.fontFamily.sans],
      },
      fontSize: {
        // The whole scale (including Tailwind's own xs–9xl below) runs at
        // 90% of its "natural" size — text only, not spacing/icons/radius,
        // which stay off Tailwind's default rem scale here so they're
        // unaffected. Every value is the standard one × 0.9; line-heights
        // given as unitless ratios and letter-spacing in em scale with the
        // font size automatically, so only the size numbers themselves
        // needed recalculating.
        xs: ["0.675rem", { lineHeight: "0.9rem" }],
        sm: ["0.7875rem", { lineHeight: "1.125rem" }],
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

        // Named against the brief's px targets (16px base) rather than the
        // default scale, so hero/section headings land at the sizes asked
        // for instead of Tailwind's smaller defaults — also ×0.9.
        "hero-mobile": ["2.475rem", { lineHeight: "1.08", letterSpacing: "-0.02em" }], // was 44px
        hero: ["3.15rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }], // was 56px
        "hero-lg": ["4.05rem", { lineHeight: "1.02", letterSpacing: "-0.02em" }], // was 72px
        "section-mobile": ["1.8rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }], // was 32px
        section: ["2.475rem", { lineHeight: "1.1", letterSpacing: "-0.01em" }], // was 44px
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
        soft: "0 2px 8px 0 rgb(15 23 42 / 0.06), 0 1px 2px 0 rgb(15 23 42 / 0.04)",
        card: "0 8px 30px rgb(15 23 42 / 0.08)",
        lift: "0 16px 40px rgb(15 23 42 / 0.12)",
        glow: "0 0 0 1px hsl(142 71% 45% / 0.12), 0 20px 60px -12px hsl(142 71% 45% / 0.35)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "float-sm": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        float: "float 5s ease-in-out infinite",
        "float-sm": "float-sm 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
