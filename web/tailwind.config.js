import { heroui } from '@heroui/theme';

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        heading: ['var(--font-heading)'],
        mono: ['var(--font-mono)'],
      },
      animation: {
        aurora: 'aurora 60s linear infinite',
      },
      keyframes: {
        aurora: {
          from: {
            backgroundPosition: '50% 50%, 50% 50%',
          },
          to: {
            backgroundPosition: '350% 50%, 350% 50%',
          },
        },
      },
      colors: {
        // 🟢 Updated Primary = Green (#009e10)
        primary: {
          50: '#E6F7E8',
          100: '#CEEFD1',
          200: '#9DE0A3',
          300: '#6CD075',
          400: '#3BC147',
          500: '#009e10',
          600: '#00800D',
          700: '#00620A',
          800: '#004406',
          900: '#002603',
          DEFAULT: '#009e10',
        },
        brand: {
          50: '#E6F7E8',
          100: '#CEEFD1',
          200: '#9DE0A3',
          300: '#6CD075',
          400: '#3BC147',
          500: '#009e10',
          600: '#00800D',
          700: '#00620A',
          800: '#004406',
          900: '#002603',
          DEFAULT: '#009e10',
          foreground: '#FFFFFF',
        },
        // 🟠 Updated Secondary = Orange (#fa8901)
        secondary: {
          50: '#FFF2E6',
          100: '#FFE6CC',
          200: '#FFCC99',
          300: '#FFB366',
          400: '#FF9933',
          500: '#fa8901',
          600: '#D87501',
          700: '#B56101',
          800: '#924D01',
          900: '#6E3A00',
          DEFAULT: '#fa8901',
        },
      },
    },
  },
  darkMode: 'class',
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            // Light mode base colors with brand- prefix
            'brand-background': '#FAFFFB',
            'brand-foreground': '#030f04',
            'brand-divider': '#E5E7EB',
            'brand-focus': '#fa8901',
            'brand-overlay': 'rgba(0, 0, 0, 0.5)',

            background: '#ffffff',
            foreground: '#000000',
            divider: '#E5E7EB',
            focus: '#fa8901',
            overlay: 'rgba(0, 0, 0, 0.5)',
          },
        },
        dark: {
          colors: {
            'brand-background': '#030f04',
            'brand-foreground': '#FAFFFB',
            'brand-divider': '#1F1B2E',
            'brand-focus': '#009e10',
            'brand-overlay': 'rgba(0, 0, 0, 0.7)',

            // Standard HeroUI colors
            background: '#000000',
            foreground: '#E8E4F0',
            divider: '#1F1B2E',
            focus: '#009e10', // Updated to primary color
            overlay: 'rgba(0, 0, 0, 0.7)',

            default: {
              100: '#131219',
              200: '#1A1825',
              300: '#211E2E',
              400: '#6B6478',
              500: '#A69FB3',
              600: '#C4BDD1',
              700: '#D6D1E0',
              800: '#E8E4F0',
              900: '#F5F3F8',
              DEFAULT: '#131219',
              foreground: '#E8E4F0',
            },
          },
        },
      },
    }),
  ],
};

export default config;
