/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff", 100: "#d9eaff", 200: "#bcd9ff", 300: "#8ec0ff",
          400: "#599cff", 500: "#3377f6", 600: "#1f59db", 700: "#1947b2",
          800: "#1a3e8e", 900: "#1b3771",
        },
      },
    },
  },
  plugins: [],
};
