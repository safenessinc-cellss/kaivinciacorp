/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'sidebar-bg': 'var(--color-sidebar-bg)',
        'sidebar-text': 'var(--color-sidebar-text)',
        'sidebar-active': 'var(--color-sidebar-active)',
        'header-bg': 'var(--color-header-bg)'
      },
      fontFamily: {
        sans: ['var(--font-family)', 'sans-serif']
      },
      borderRadius: {
        DEFAULT: 'var(--border-radius)'
      }
    },
  },
  plugins: [],
};
