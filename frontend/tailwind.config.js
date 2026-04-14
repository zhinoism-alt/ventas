/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0f1e',
          800: '#0f172a',
          700: '#1e293b',
          600: '#2d3f58',
          500: '#3d5068',
        }
      }
    },
  },
  plugins: [],
}
