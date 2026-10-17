import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: { 950: '#05110c', 900: '#0a1a13', 800: '#10261c', 700: '#183629', 600: '#254a39' }, gold: { 300: '#ecd9a3', 400: '#d9bd72', 500: '#c3a14d', 600: '#9b7d35' }, bone: '#ece8df' },
      fontFamily: { display: ['Georgia', '"Times New Roman"', 'serif'], sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] }
    }
  },
  plugins: []
} satisfies Config;
