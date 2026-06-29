import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        court: {
          navy: "#08243a",
          blue: "#1266f1",
          green: "#16a34a",
          teal: "#14b8a6",
          lime: "#a3e635",
          mist: "#eef9f8",
          ink: "#102033"
        }
      },
      boxShadow: {
        court: "0 18px 60px rgba(8, 36, 58, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
