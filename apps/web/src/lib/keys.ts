// Global keyboard shortcuts.
import { onKeyStroke } from "@vueuse/core";

export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
};

/**
 * Register key handlers for the lifetime of a component (VueUse `onKeyStroke` with a key filter).
 * Keys: "j", "/", "ArrowUp", "mod+k" (Ctrl/⌘), "alt+x" …; the raw `e.key` matches too (e.g. "?"
 * typed with Shift) — but not for Ctrl/⌘/Alt combinations, so Ctrl+R still reloads instead of
 * running "r". Skipped while typing in a form field (except `whileTyping`, Ctrl/⌘ combos and
 * Escape) and during IME composition.
 */
export function useKeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  opts: { whileTyping?: string[] } = {},
) {
  const resolve = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return undefined; // IME composition
    const mod = e.ctrlKey || e.metaKey;
    const key = [
      mod ? "mod" : "",
      e.altKey ? "alt" : "",
      e.key.length === 1 ? e.key.toLowerCase() : e.key,
    ]
      .filter(Boolean)
      .join("+");
    const fn = map[key] ?? (mod || e.altKey ? undefined : map[e.key]);
    if (!fn) return undefined;
    if (isTyping(e) && !opts.whileTyping?.includes(key) && !mod && e.key !== "Escape")
      return undefined;
    return fn;
  };
  let pending: ((e: KeyboardEvent) => void) | undefined;
  onKeyStroke(
    (e) => !!(pending = resolve(e)),
    (e) => {
      e.preventDefault();
      pending?.(e);
    },
  );
}

/**
 * true while an IME is composing: the Enter that confirms a composition must not submit
 * (isComposing, plus keyCode 229 for Safari's out-of-order compositionend; modern-web-guidance: ime-safe-enter-submit)
 */
export const isImeEnter = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;
