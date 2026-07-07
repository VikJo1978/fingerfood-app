/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette derived from the Silberlöffel logo (muted sage circle,
        // charcoal script). accent must keep >= 4.5:1 contrast with white text.
        accent: {
          DEFAULT: "#5c6f63",
          deep: "#4a5b50",
          soft: "#e9eeea",
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(38, 48, 43, 0.05), 0 10px 30px rgba(38, 48, 43, 0.05)",
      },
    },
  },
  plugins: [],
};
