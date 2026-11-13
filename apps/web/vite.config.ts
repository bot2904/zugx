import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "zugx",
        short_name: "zugx",
        description: "Fast, keyboard-first timetable browser for Austrian trains",
        theme_color: "#0b0d10",
        background_color: "#0b0d10",
        display: "standalone",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,json,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
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
  test: {
    include: ["src/**/*.test.ts"],
  },
});
