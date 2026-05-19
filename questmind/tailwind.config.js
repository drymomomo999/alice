/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
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
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ===== Sakura Theme Colors =====
        // 樱花粉系列
        "sakura-pink": "hsl(var(--sakura-pink))",
        "sakura-light": "hsl(var(--sakura-light))",
        "sakura-pale": "hsl(var(--sakura-pale))",
        "sakura": "hsl(var(--sakura-pink))",

        // 桃橙系列
        "peach-orange": "hsl(var(--peach-orange))",
        "peach-light": "hsl(var(--peach-light))",
        "peach": "hsl(var(--peach-orange))",

        // 薰衣紫系列
        "lavender": "hsl(var(--lavender))",
        "lavender-light": "hsl(var(--lavender-light))",
        "void": "hsl(var(--lavender))",

        // 天蓝
        "sky-blue": "hsl(var(--sky-blue))",
        "sky": "hsl(var(--sky-blue))",

        // 薄荷绿
        "mint-green": "hsl(var(--mint-green))",
        "mint": "hsl(var(--mint-green))",

        // Background system (direct names)
        "bg-warm": "hsl(var(--bg-warm))",
        "bg-base": "hsl(var(--bg-base))",
        "bg-surface": "hsl(var(--bg-surface))",
        "bg-elevated": "hsl(var(--bg-elevated))",
        "bg-hover": "hsl(var(--bg-hover))",
        "bg-deep": "hsl(var(--bg-warm))",

        // Background system (prefixed, for opacity modifier support)
        "bg-bg-deep": "hsl(var(--bg-warm))",
        "bg-bg-surface": "hsl(var(--bg-surface))",
        "bg-bg-elevated": "hsl(340 28% 97%)",
        "bg-bg-base": "hsl(var(--bg-base))",

        // Text system
        "text-primary": "hsl(var(--text-primary))",
        "text-secondary": "hsl(var(--text-secondary))",
        "text-muted": "hsl(var(--text-muted))",
        "text-accent": "hsl(var(--text-accent))",

        // Border system
        "border-subtle": "hsl(var(--border-subtle))",
        "border-default": "hsl(var(--border-default))",
        "border-highlight": "hsl(var(--border-highlight))",

        // Compat aliases (for old tech theme references)
        "cyber": "hsl(var(--sakura-pink))",
        "honkai-gold": "hsl(var(--peach-orange))",
        "ark-orange": "hsl(15 80% 62%)",
        "ark-red": "hsl(0 75% 55%)",

        // Danger
        "danger": "hsl(0 75% 55%)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      fontFamily: {
        sans: ['Nunito', 'Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
