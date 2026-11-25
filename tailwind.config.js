/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './mentee/index.html', './auth/confirm/index.html', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
      colors: {
        navy: { 50: '#f4f6fb', 100: '#e8edf7', 200: '#cfd8ea', 300: '#a9b7d3', 400: '#7a8db5', 500: '#526894', 600: '#3a4e78', 700: '#1e2a4a', 800: '#152038', 900: '#0c1424' },
        gold: { 50: '#fdf9ec', 100: '#f8efcc', 200: '#f0de97', 300: '#e6c860', 400: '#d4af37', 500: '#c9a227', 600: '#b8860b', 700: '#94690d', 800: '#7a5512', 900: '#664614' },
      },
    },
  },
  plugins: [],
};
