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
        },
        playr: {
          surface: {
            page: "rgb(var(--surface-page) / <alpha-value>)",
            card: "rgb(var(--surface-card) / <alpha-value>)",
            muted: "rgb(var(--surface-muted) / <alpha-value>)",
            elevated: "rgb(var(--surface-elevated) / <alpha-value>)"
          },
          text: {
            primary: "rgb(var(--text-primary) / <alpha-value>)",
            secondary: "rgb(var(--text-secondary) / <alpha-value>)",
            muted: "rgb(var(--text-muted) / <alpha-value>)"
          },
          border: {
            subtle: "rgb(var(--border-subtle) / <alpha-value>)",
            strong: "rgb(var(--border-strong) / <alpha-value>)"
          },
          focus: "rgb(var(--focus-ring) / <alpha-value>)"
        },
        semantic: {
          success: "rgb(var(--semantic-success) / <alpha-value>)",
          warning: "rgb(var(--semantic-warning) / <alpha-value>)",
          error: "rgb(var(--semantic-error) / <alpha-value>)",
          info: "rgb(var(--semantic-info) / <alpha-value>)"
        }
      },
      borderRadius: {
        "playr-sm": "var(--radius-sm)",
        "playr-md": "var(--radius-md)",
        "playr-lg": "var(--radius-lg)",
        "playr-xl": "var(--radius-xl)"
      },
      boxShadow: {
        court: "0 18px 60px rgba(8, 36, 58, 0.14)",
        "playr-subtle": "var(--shadow-subtle)",
        "playr-card": "var(--shadow-card)",
        "playr-elevated": "var(--shadow-elevated)",
        "playr-floating": "var(--shadow-floating)"
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        standard: "var(--motion-standard)",
        slow: "var(--motion-slow)"
      }
    }
  },
  plugins: []
};

export default config;
