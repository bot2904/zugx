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
        id: "/",
        start_url: "/",
        scope: "/",
        lang: "de",
        categories: ["travel", "navigation", "utilities"],
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Radar",
            url: "/radar",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Züge / Trains",
            url: "/trains",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Bildfahrplan",
            url: "/bf",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Störungen / Disruptions",
            url: "/him",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,json,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//, /\.txt$/],
        // big, rarely used data (67 Bildfahrplan corridors, full train index): not precached on
        // install, cached on first use instead (hashed file names → cache-first is safe)
        globIgnores: ["**/corridor-*.js", "**/trains-*.full-*.js"],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(corridor-|trains-\d{4}\.full-)[^/]+\.js$/,
            handler: "CacheFirst",
            options: { cacheName: "zugx-data", expiration: { maxEntries: 40 } },
          },
        ],
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
    // third-party licenses of the bundled dependencies (production build only); not under /assets/,
    // which is served as immutable
    license: { fileName: "licenses.txt" },
    target: "es2023",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // recognisable names for corridor data chunks (excluded from the service worker precache)
        chunkFileNames: (chunk) =>
          chunk.facadeModuleId?.includes("/netz/data/corridors/") &&
          !chunk.facadeModuleId.endsWith("/index.json")
            ? "assets/corridor-[name]-[hash].js"
            : "assets/[name]-[hash].js",
      },
    },
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
