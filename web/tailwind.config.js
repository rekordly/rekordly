import { heroui } from "@heroui/theme";

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        heading: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },
      animation: {
        aurora: "aurora 60s linear infinite",
      },
      keyframes: {
        aurora: {
          from: {
            backgroundPosition: "50% 50%, 50% 50%",
          },
          to: {
            backgroundPosition: "350% 50%, 350% 50%",
          },
        },
      },
      colors: {
        // 🟣 Fixed Primary = Purple (never changes)
        primary: {
          50: "#F5E6FF",
          100: "#EBCCFF",
          200: "#D699FF",
          300: "#C266FF",
          400: "#AD33FF",
          500: "#8900FF",
          600: "#7000CC",
          700: "#5800A3",
          800: "#3F0075",
          900: "#2B0052",
          DEFAULT: "#8900FF",
        },
        brand: {
          50: "#F5E6FF",
          100: "#EBCCFF",
          200: "#D699FF",
          300: "#C266FF",
          400: "#AD33FF",
          500: "#8900FF",
          600: "#7000CC",
          700: "#5800A3",
          800: "#3F0075",
          900: "#2B0052",
          DEFAULT: "#8900FF",
          foreground: "#FFFFFF",
        },
        // 🟠 Fixed Secondary = Orange (never changes)
        secondary: {
          50: "#FFF3E6",
          100: "#FFE7CC",
          200: "#FFCF99",
          300: "#FFB766",
          400: "#FF9F33",
          500: "#F38527",
          600: "#D96E0F",
          700: "#B35A0A",
          800: "#8C4607",
          900: "#663305",
          DEFAULT: "#F38527",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            // Light mode base colors with brand- prefix
            "brand-background": "#FAFAFA",
            "brand-foreground": "#1A1625",
            "brand-divider": "#E5E7EB",
            "brand-focus": "#F38527",
            "brand-overlay": "rgba(0, 0, 0, 0.5)",
            "brand-content1": "#FFFFFF",
            "brand-content2": "#F5F5F5",
            "brand-content3": "#ECECEC",
            "brand-content4": "#E0E0E0",
            // Standard HeroUI colors
            background: "#FAFAFA",
            foreground: "#1A1625",
            divider: "#E5E7EB",
            focus: "#F38527",
            overlay: "rgba(0, 0, 0, 0.5)",
            content1: "#FFFFFF",
            content2: "#F5F5F5",
            content3: "#ECECEC",
            content4: "#E0E0E0",
            default: {
              DEFAULT: "#F5F5F5",
              foreground: "#1A1625",
            },
          },
        },
        dark: {
          colors: {
            "brand-background": "#09080f",
            "brand-foreground": "#E8E4F0",
            "brand-divider": "#1F1B2E",
            "brand-focus": "#8900FF",
            "brand-overlay": "rgba(0, 0, 0, 0.7)",
            "brand-content1": "#131219",
            "brand-content2": "#1A1825",
            "brand-content3": "#211E2E",
            "brand-content4": "#2A2638",
            // Standard HeroUI colors
            background: "#09080f",
            foreground: "#E8E4F0",
            divider: "#1F1B2E",
            focus: "#8900FF",
            overlay: "rgba(0, 0, 0, 0.7)",
            content1: "#131219",
            content2: "#1A1825",
            content3: "#211E2E",
            content4: "#2A2638",
            default: {
              100: "#131219",
              200: "#1A1825",
              300: "#211E2E",
              400: "#6B6478",
              500: "#A69FB3",
              600: "#C4BDD1",
              700: "#D6D1E0",
              800: "#E8E4F0",
              900: "#F5F3F8",
              DEFAULT: "#131219",
              foreground: "#E8E4F0",
            },
          },
        },
      },
    }),
  ],
};

export default config;
