// Periodic background refresh: only while the tab is visible, and once more right away when the tab
// becomes visible again after the interval has passed (stale data). Stops with the component.
import { useDocumentVisibility, useIntervalFn } from "@vueuse/core";
import { watch, type MaybeRefOrGetter, toValue } from "vue";

export function useAutoRefresh(
  fn: () => void,
  ms: number,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const visibility = useDocumentVisibility();
  let last = Date.now();
  const run = () => {
    if (!toValue(enabled) || visibility.value !== "visible") return;
    last = Date.now();
    fn();
  };
  useIntervalFn(run, ms);
  watch(visibility, (v) => {
    if (v === "visible" && Date.now() - last >= ms) run();
  });
}
