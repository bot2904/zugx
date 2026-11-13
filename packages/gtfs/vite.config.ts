import { defineConfig } from "vite-plus";

export default defineConfig({
  // Node < 26 has no native Temporal: install the polyfill (keeps native where present)
  test: { setupFiles: ["temporal-polyfill/global"] },
});
