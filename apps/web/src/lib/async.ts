// Small async-state helper for pages.
import { ref, shallowRef, type Ref, type ShallowRef } from "vue";

export interface AsyncState<T> {
  data: ShallowRef<T | undefined>;
  error: Ref<string | undefined>;
  loading: Ref<boolean>;
  run: () => Promise<void>;
}

export function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const data = shallowRef<T>();
  const error = ref<string>();
  const loading = ref(false);
  let seq = 0;
  async function run() {
    const my = ++seq;
    loading.value = true;
    error.value = undefined;
    try {
      const d = await fn();
      if (my === seq) data.value = d;
    } catch (e) {
      if (my === seq) error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === seq) loading.value = false;
    }
  }
  return { data, error, loading, run };
}
