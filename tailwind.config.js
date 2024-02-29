/** @type {import('tailwindcss').Config} */
// eslint-disable-next-line import/no-anonymous-default-export
export default {
  content: [
    "./index.html",
    "./src/client/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

