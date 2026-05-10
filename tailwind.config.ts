import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // 8px grid base — all spacing is multiples of 2 (0.5rem steps)
    container: {
      center: true,
      padding: "1rem",
      screens: {
        DEFAULT: "1200px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1200px",
        "2xl": "1200px"
      }
    },
    extend: {
      maxWidth: {
        "brand-layout": "1200px"
      },
      colors: {
        // Semantic tokens — used by components via CSS variables
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))"
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))"
        },
        // TL Finance Core brand palette — fixed values, not theme-dependent
        brand: {
          purple: "#7A3CFF",
          cyan: "#00D1C7",
          "purple-hsl": "260 100% 62%",
          "cyan-hsl": "177 100% 41%"
        }
      },
      backgroundImage: {
        // Primary brand gradient: purple → cyan
        "brand-gradient": "linear-gradient(135deg, #7A3CFF 0%, #00D1C7 100%)",
        "brand-gradient-h": "linear-gradient(90deg, #7A3CFF 0%, #00D1C7 100%)"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        // Inter loaded via next/font in layout.tsx
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
