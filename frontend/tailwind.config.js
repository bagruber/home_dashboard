/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // True black canvas for OLED. Surfaces sit slightly above with subtle warmth.
        canvas: "#000000",
        surface: "#0e0e10",
        "surface-2": "#161618",
        hairline: "rgba(255,255,255,0.06)",
        ink: {
          high: "#ececef",
          mid: "#a8a8ad",
          low: "#6e6e74",
        },
        // Direction-coded destination accents. München + Freising share a blue hue family;
        // Landshut is a distinct warm yellow. All three are colorblind-distinguishable
        // from the red used for delays and cancellations.
        munich: "#1a91d7",
        freising: "#7ec8ea",
        landshut: "#f5c542",
        alert: "#e2453c",
        // Line-chip brand colours.
        "db-red": "#EC1B2D",
        sbahn: "#19BBE7",
        // Family member accents. Picked from Okabe-Ito so the four are distinguishable
        // under deutan/protan/tritan vision and do not collide with the alert red.
        "person-bene": "#1a91d7",
        "person-sebi": "#e69f00",
        "person-mama": "#cc79a7",
        "person-papa": "#009e73",
        // Tint applied to events that block the house / part of it.
        house: "#c5751a",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
