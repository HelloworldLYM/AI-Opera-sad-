/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'china-red': '#C41E3A',
        'imperial-gold': '#FFD700',
        'ink-black': '#1A1A1A',
        'jade-green': '#00A86B',
        'porcelain': '#F8F8F8',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.01)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
