// Colour scheme: follows the system by default; an explicit override ("light" | "dark") is stored and
// reflected in <meta name="color-scheme"> (CSS maps it to `color-scheme`, light-dark() follows).
// Two-state toggle: switching back to what the system prefers removes the override.
// (public/theme.js applies a stored override before first paint.)
import { useLocalStorage, usePreferredDark } from "@vueuse/core";
import { computed, watchEffect } from "vue";

const systemDark = usePreferredDark();
/** stored override, null = follow the system (synced across tabs by VueUse) */
const override = useLocalStorage<"light" | "dark" | null>("zugx:color-scheme", null, {
  serializer: { read: (v) => (v === "light" || v === "dark" ? v : null), write: (v) => v ?? "" },
});

/** the scheme currently rendered */
export const scheme = computed<"light" | "dark">(
  () => override.value ?? (systemDark.value ? "dark" : "light"),
);

watchEffect(() => {
  if (typeof document === "undefined") return; // tests (Node)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) meta.content = override.value ?? "light dark";
});

/** switch to the opposite of what is shown; matching the system preference removes the override */
export function toggleScheme() {
  const target = scheme.value === "dark" ? "light" : "dark";
  override.value = target === (systemDark.value ? "dark" : "light") ? null : target;
}
