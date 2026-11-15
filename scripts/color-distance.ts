// Pairwise distinguishability of a colour palette (e.g. the category colours in
// apps/web/src/lib/products.ts): OKLab ΔE×100 for normal vision and the minimum under protan/deutan
// simulation (Machado et al. 2009, severity 1), plus white-text contrast (WCAG) for badges.
// Lists the pairs below ΔE 15 (normal) or 8 (CVD), closest first.
//   node scripts/color-distance.ts '{"RJX":"#d0102a","RJ":"#b8157a"}'
const C: Record<string, string> = JSON.parse(process.argv[2] ?? "{}");
type V = [number, number, number];
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (h: string): V => [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255)) as V;
function oklab([r, g, b]: V): V {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const CVD: Record<string, V[]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};
const sim = (c: V, m: V[]): V =>
  m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))) as V;
const dE = (a: V, b: V) => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const ks = Object.keys(C);
const rows: [string, number, number][] = [];
for (let i = 0; i < ks.length; i++)
  for (let j = i + 1; j < ks.length; j++) {
    const a = rgb(C[ks[i]!]!);
    const b = rgb(C[ks[j]!]!);
    const cvd = Math.min(...Object.values(CVD).map((m) => dE(oklab(sim(a, m)), oklab(sim(b, m)))));
    rows.push([`${ks[i]} – ${ks[j]}`, dE(oklab(a), oklab(b)), cvd]);
  }
rows.sort((x, y) => x[1] - y[1]);
for (const [n, nv, cvd] of rows.filter((r) => r[1] < 15 || r[2] < 8))
  console.log(
    `${n.padEnd(20)} normal ${nv.toFixed(1).padStart(5)}   CVD ${cvd.toFixed(1).padStart(5)}`,
  );
const lum = (h: string) => {
  const [r, g, b] = rgb(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const low = Object.entries(C).filter(([, h]) => 1.05 / (lum(h) + 0.05) < 4.5);
console.log(
  "white text < 4.5:1:",
  low.map(([k, h]) => `${k} ${(1.05 / (lum(h) + 0.05)).toFixed(2)}`).join(", ") || "none",
);
