import { defineConfig, transformerDirectives } from "unocss";
import presetWind4 from "@unocss/preset-wind4";

export default defineConfig({
  presets: [presetWind4()],
  transformers: [transformerDirectives()],
  theme: {
    font: {
      sans: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    },
  },
  shortcuts: {
    card: "rounded-md border border-[var(--line)] bg-[var(--bg2)]",
    btn: "inline-flex items-center gap-1 rounded border border-[var(--line)] px-2 py-1 text-sm hover:bg-[var(--bg3)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer select-none",
    "btn-on": "bg-[var(--bg3)] border-[var(--accent)] text-[var(--fg)]",
    input:
      "rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-[var(--fg)] outline-none focus:border-[var(--accent)]",
    muted: "text-[var(--muted)]",
    mono: "font-mono tabular-nums",
    kbd: "font-mono text-[0.6875rem] rounded border border-[var(--line)] px-1 py-px muted",
  },
});
