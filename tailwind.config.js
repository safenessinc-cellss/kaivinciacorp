/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', active: 'var(--accent-active)', subtle: 'var(--accent-subtle)', light: 'var(--accent-light)', focus: 'var(--accent-focus)' },
        fg: { primary: 'var(--fg-primary)', secondary: 'var(--fg-secondary)', tertiary: 'var(--fg-tertiary)', placeholder: 'var(--fg-placeholder)', link: 'var(--fg-link)', inverse: 'var(--fg-inverse)' },
        surface: { DEFAULT: 'var(--color-surface)', page: 'var(--bg-page)', grouped: 'var(--bg-grouped)', elevated: 'var(--bg-elevated)', sidebar: 'var(--bg-sidebar)', toolbar: 'var(--bg-toolbar)', overlay: 'var(--bg-overlay)' },
        system: { red: 'var(--color-red)', orange: 'var(--color-orange)', yellow: 'var(--color-yellow)', green: 'var(--color-green)', mint: 'var(--color-mint)', teal: 'var(--color-teal)', cyan: 'var(--color-cyan)', blue: 'var(--color-blue)', indigo: 'var(--color-indigo)', purple: 'var(--color-purple)', pink: 'var(--color-pink)', brown: 'var(--color-brown)', gray: 'var(--color-gray)' },
        semantic: { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--info)', 'success-bg': 'var(--success-bg)', 'warning-bg': 'var(--warning-bg)', 'danger-bg': 'var(--danger-bg)', 'info-bg': 'var(--info-bg)' },
        separator: { DEFAULT: 'var(--separator)', opaque: 'var(--separator-opaque)' },
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        background: 'var(--color-background)',
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
