/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:             "var(--color-bg)",
        "bg-alt":       "var(--color-bg-alt)",
        panel:          "var(--color-panel)",
        surface:        "var(--color-surface)",
        border:         "var(--color-border)",
        "border-strong":"var(--color-border-strong)",
        foreground:     "var(--color-text)",
        secondary:      "var(--color-text-secondary)",
        muted:          "var(--color-muted)",
        accent:         "var(--color-accent)",
        "accent-light": "var(--color-accent-light)",
        "accent-hover": "var(--color-accent-hover)",
        danger:         "var(--color-danger)",
        "danger-light": "var(--color-danger-light)",
        warning:        "var(--color-warning)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        card: "0 1px 3px var(--color-shadow)",
        "card-hover": "0 4px 12px var(--color-shadow-strong)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
