/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette derived from the Silberlöffel logo (muted sage circle,
        // charcoal script). accent must keep >= 4.5:1 contrast with white text.
        // Values below are shared byte-for-byte with the Office Panel's
        // OFFICE_PANEL_STYLE (silberloeffel-catering repo) so both apps read
        // as one product — see CONFIGURATOR_OFFICE_PANEL_VISUAL_ALIGNMENT_V1.
        accent: {
          DEFAULT: "#5c6f63",
          deep: "#4a5b50",
          soft: "#e9eeea",
        },
        ink: "#1a1f1c",
        muted: "#5f5e5a",
        line: "#e2e5e2",
        canvas: "#f6f7f6",
        warm: "#c79262",
        warning: {
          DEFAULT: "#8a611e",
          soft: "#fbf3e7",
          border: "#e5cfab",
        },
        danger: {
          DEFAULT: "#9d3f38",
          soft: "#fbefee",
          border: "#e1bbb7",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "18px",
        control: "9px",
      },
      boxShadow: {
        card: "0 10px 30px rgba(41, 54, 47, 0.06)",
      },
      maxWidth: {
        content: "1440px",
      },
      outlineColor: {
        warm: "#c79262",
      },
    },
  },
  plugins: [],
};
