// Print the timetable book (/kursbuch) to a PDF with headless Chromium.
// Needs a running app (default http://localhost:5173, e.g. `vp run dev` or the preview server).
//   vp run kursbuch:pdf   env: URL, D=YYYY-MM-DD, VON=100, BIS=999 or BILDER=101,300, COLS=12, OUT=…
import { chromium } from "@playwright/test";

const base = process.env.URL ?? "http://localhost:5173";
const q = new URLSearchParams();
for (const [k, e] of [
  ["d", "D"],
  ["von", "VON"],
  ["bis", "BIS"],
  ["cols", "COLS"],
] as const)
  if (process.env[e]) q.set(k, process.env[e]!);
const out = process.env.OUT ?? `kursbuch${process.env.D ? `-${process.env.D}` : ""}.pdf`;

const browser = await chromium.launch();
const page = await browser.newPage({ locale: "de-AT" });
const t0 = Date.now();
await page.goto(`${base}/kursbuch?${q}`);
// all sheets loaded and rendered
await page.locator(".kursbuch[data-ready]").waitFor({ timeout: 600_000 });
const tReady = Date.now();
await page.emulateMedia({ media: "print" });
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
const s = (ms: number) => `${(ms / 1000).toFixed(0)} s`;
console.log(
  `kursbuch: ${out} (loaded and typeset ${s(tReady - t0)}, PDF ${s(Date.now() - tReady)})`,
);
