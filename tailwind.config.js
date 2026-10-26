/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // tema escuro ligado pela classe `dark` no <html> (veja src/lib/theme.js)
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7fb',
          100: '#d5ebf5',
          500: '#1f8ab5',
          600: '#17718f',
          700: '#135c75',
          900: '#0d3b4c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
