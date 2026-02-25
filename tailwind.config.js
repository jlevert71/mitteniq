/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
  colors: {
  blueprint: {
  950: "#070F1F", // near-black navy (no teal)
  900: "#0B1630", // main blueprint base
  800: "#0E1D3D",
  700: "#132655",
  600: "#1A3573",
},
    copper: {
      400: "#D18B47",
      500: "#B87333"
    }
  }
}
  },
  plugins: [],
};