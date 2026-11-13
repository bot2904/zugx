import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite-plus";

/** last commit as `<hash> <YYYY-MM-DD>`, empty without a git checkout (e.g. container build) */
function gitVersion(): string {
  try {
    return execFileSync("git", ["log", "-1", "--format=%h %cs"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
const [commitHash = "", commitDate = ""] = gitVersion().split(" ");
// exposed as import.meta.env.VITE_*, unless already set in the environment (CI build args)
process.env.VITE_COMMIT_HASH ??= commitHash;
process.env.VITE_COMMIT_DATE ??= commitDate;

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "zugx",
        short_name: "zugx",
        description: "Austrian trains, fast: departures, connections, train runs, live",
        theme_color: "#0b0d10",
        background_color: "#0b0d10",
        display: "standalone",
        // opening a zugx link while the installed app is open: navigate it to the link
        // (default may just focus the existing window, staying on e.g. /radar)
        launch_handler: { client_mode: ["navigate-existing", "auto"] },
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,json,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  // maplibre-gl loads its worker via new URL(..., import.meta.url); pre-bundling breaks that
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: {
    proxy: {
      "/api/mgate": {
        target: "https://fahrplan.oebb.at",
        changeOrigin: true,
        rewrite: () => "/bin/mgate.exe",
        headers: { "User-Agent": "zugx-dev (https://zugx.legner.me)" },
      },
    },
  },
  build: {
    target: "es2023",
    chunkSizeWarningLimit: 1200,
  },
  run: {
    tasks: {
      // the footer version comes from env (CI/container) or from git: never replay a cached
      // build (git HEAD is not a tracked input), and pass the variables through
      build: {
        command: "vp build",
        cache: false,
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
