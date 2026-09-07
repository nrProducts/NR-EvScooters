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
        // Named against the brief's px targets (16px base) rather than the
        // default scale, so hero/section headings land at the sizes asked
        // for instead of Tailwind's smaller defaults.
        "hero-mobile": ["2.75rem", { lineHeight: "1.08", letterSpacing: "-0.02em" }], // 44px
        hero: ["3.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }], // 56px
        "hero-lg": ["4.5rem", { lineHeight: "1.02", letterSpacing: "-0.02em" }], // 72px
        "section-mobile": ["2rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }], // 32px
        section: ["2.75rem", { lineHeight: "1.1", letterSpacing: "-0.01em" }], // 44px
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
