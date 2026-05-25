/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'x-blue': '#1d9bf0',
        'x-blue-hover': '#1a8cd8',
        'x-dark': 'var(--color-x-dark)',
        'x-darker': 'var(--color-x-darker)',
        'x-gray': '#71767b',
        'x-gray-light': '#eff3f4',
        'x-border': 'var(--color-x-border)',
        'x-hover': 'var(--color-x-hover)',
        'x-search': 'var(--color-x-search)',
        'x-search-hover': '#d7dadc',
        'x-danger': '#f4212e',
        'x-green': '#00ba7c',
        'x-repost': '#00ba7c',
      },
    },
  },
  plugins: [],
};
