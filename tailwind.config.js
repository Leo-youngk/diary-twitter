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
        'x-blue': 'rgb(var(--color-x-blue) / <alpha-value>)',
        'x-blue-hover': 'rgb(var(--color-x-blue-hover) / <alpha-value>)',
        'x-dark': 'var(--color-x-dark)',
        'x-darker': 'var(--color-x-darker)',
        'x-gray': 'rgb(var(--color-x-gray) / <alpha-value>)',
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
