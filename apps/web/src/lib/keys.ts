// Global keyboard shortcuts.
import { useEventListener } from "@vueuse/core";

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

/** Register key handlers for the lifetime of a component. Keys: "j", "k", "/", "mod+k", "shift+?" … */
export function useKeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  opts: { whileTyping?: string[] } = {},
) {
  const handler = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return; // IME composition: never trigger shortcuts
    const key = [
      e.ctrlKey || e.metaKey ? "mod" : "",
      e.altKey ? "alt" : "",
      e.key.length === 1 ? e.key.toLowerCase() : e.key,
    ]
      .filter(Boolean)
      .join("+");
    // with Ctrl/⌘/Alt only exact matches ("mod+k"): Ctrl+R must reload, not run "r";
    // without, also the raw key (e.g. "?" typed with Shift, "ArrowUp")
    const fn = map[key] ?? (e.ctrlKey || e.metaKey || e.altKey ? undefined : map[e.key]);
    if (!fn) return;
    if (
      isTyping(e) &&
      !opts.whileTyping?.includes(key) &&
      !key.startsWith("mod+") &&
      e.key !== "Escape"
    )
      return;
    e.preventDefault();
    fn(e);
  };
  useEventListener(window, "keydown", handler);
}

/**
 * true while an IME is composing: the Enter that confirms a composition must not submit
 * (isComposing, plus keyCode 229 for Safari's out-of-order compositionend; modern-web-guidance: ime-safe-enter-submit)
 */
export const isImeEnter = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;
