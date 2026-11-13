// Colour scheme: follows the system by default; an explicit override ("light" | "dark") is stored and
// reflected in <meta name="color-scheme"> (CSS maps it to `color-scheme`, light-dark() follows).
// Two-state toggle: switching back to what the system prefers removes the override.
import { ref } from "vue";

const KEY = "zugx:color-scheme";
const media = matchMedia("(prefers-color-scheme: dark)");
const meta = () => document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');

function stored(): "light" | "dark" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const system = () => (media.matches ? "dark" : "light");
/** the scheme currently rendered */
export const scheme = ref<"light" | "dark">(stored() ?? system());

function apply(v: "light" | "dark" | null) {
  const m = meta();
  if (m) m.content = v ?? "light dark";
  scheme.value = v ?? system();
}

/** switch to the opposite of what is shown; matching the system preference removes the override */
export function toggleScheme() {
  const target = scheme.value === "dark" ? "light" : "dark";
  const override = target === system() ? null : target;
  try {
    if (override) localStorage.setItem(KEY, override);
    else localStorage.removeItem(KEY);
  } catch {
    /* site data blocked: still apply for this page */
  }
  apply(override);
}

// keep in sync with the OS (when not overridden) and with other tabs
media.addEventListener("change", () => apply(stored()));
window.addEventListener("storage", (e: StorageEvent) => {
  if (e.key === KEY) apply(stored());
});
// drop the pre-2026-11 key, which always pinned a scheme
try {
  localStorage.removeItem("zugx:theme");
} catch {
  /* ignore */
}
