<script setup lang="ts">
// Line profile: key figures of one line — length, stations, speeds, tunnels and bridges, curves,
// electrification, train protection, double track, elevation, trains per day, connections.
// From the line data (speeds, structures, points, curves), the network map data (attributes per
// piece) and the traffic density (GTFS reference day).
import type { VzgLine, VzgNetwork } from "@zugx/vzg";
import { decodePolyline } from "@zugx/vzg/geo";
import { computed, onMounted, shallowRef } from "vue";
import { useI18n } from "../i18n/index.ts";
import { DEFAULT_COUNTRY } from "../lib/country.ts";
import { densityOf, lineCountry, vzgFile } from "../lib/vzg-data.ts";

const props = defineProps<{ line: VzgLine }>();
const { t, locale } = useI18n();

// network attributes and densities of the line's country: loaded once per country
interface Density {
  day: string;
  lines: { id: string; km: number[]; n: number[] }[];
}
const shared = new Map<string, Promise<[VzgNetwork | undefined, Density | undefined]>>();
function loadShared(c: string) {
  let p = shared.get(c);
  if (!p)
    shared.set(c, (p = Promise.all([vzgFile<VzgNetwork>("network", c), densityOf<Density>(c)])));
  return p;
}
const network = shallowRef<VzgNetwork>();
const density = shallowRef<Density>();
onMounted(async () => {
  [network.value, density.value] = await loadShared(lineCountry(props.line.id) ?? DEFAULT_COUNTRY);
});

const km = (v: number, d = 1) =>
  v.toLocaleString(locale.value, { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => `${Math.round(v * 100)} %`;
const lenKm = (pts: [number, number][]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const kx = Math.cos((a[0] * Math.PI) / 180);
    s += Math.hypot((b[0] - a[0]) * 111.32, (b[1] - a[1]) * 111.32 * kx);
  }
  return s;
};

const rows = computed<[string, string][]>(() => {
  const l = props.line;
  const tr = l.tracks[0];
  if (!tr) return [];
  const out: [string, string][] = [];
  const span = Math.abs(tr.kmTo - tr.kmFrom);
  out.push([
    t("vzg.profLength"),
    `${km(tr.length)} km (km ${km(Math.min(tr.kmFrom, tr.kmTo))} – ${km(Math.max(tr.kmFrom, tr.kmTo))})`,
  ]);
  // stations (one per name) and halts
  const names = new Map<string, string>();
  for (const p of tr.points)
    if (p.label && (p.kind === "station" || p.kind === "halt" || p.kind === "stop"))
      if (!names.has(p.label) || p.kind === "station") names.set(p.label, p.kind);
  const nStations = [...names.values()].filter((k) => k === "station").length;
  out.push([
    t("vzg.profStations"),
    t("vzg.profStationsValue", { s: nStations, h: names.size - nStations }),
  ]);
  // speeds: maximum, length-weighted average, share ≥ 160 km/h (higher direction)
  let vLen = 0;
  let vSum = 0;
  let fast = 0;
  let vMax = 0;
  for (const [a, b, up, down] of tr.speeds) {
    const v = Math.max(up ?? 0, down ?? 0);
    if (!v) continue;
    const len = b - a;
    vLen += len;
    vSum += v * len;
    if (v >= 160) fast += len;
    vMax = Math.max(vMax, v);
  }
  if (vLen)
    out.push([
      t("vzg.profSpeed"),
      t(fast > 0 ? "vzg.profSpeedValue" : "vzg.profSpeedValueSlow", {
        max: vMax,
        avg: Math.round(vSum / vLen),
        fast: pct(fast / Math.max(span, 0.001)),
      }),
    ]);
  // tunnels and bridges
  const st = tr.structures ?? [];
  const tun = st.filter((s) => s.kind === "tunnel");
  const bri = st.filter((s) => s.kind === "bridge" && s.length >= 20);
  const longest = (xs: typeof st) =>
    xs.reduce((a, s) => (s.length > (a?.length ?? 0) ? s : a), xs[0]);
  if (tun.length) {
    const lt = longest(tun)!;
    out.push([
      t("vzg.profTunnels"),
      t("vzg.profStructValue", {
        n: tun.length,
        sum: km(tun.reduce((a, s) => a + s.length, 0) / 1000),
        longest: `${lt.name ? `${lt.name}, ` : ""}${lt.length} m`,
      }),
    ]);
  }
  if (bri.length) {
    const lb = longest(bri)!;
    out.push([
      t("vzg.profBridges"),
      t("vzg.profStructValue", {
        n: bri.length,
        sum: km(bri.reduce((a, s) => a + s.length, 0) / 1000),
        longest: `${lb.name ? `${lb.name}, ` : ""}${lb.length} m`,
      }),
    ]);
  }
  if (tr.curves.length)
    out.push([t("vzg.profCurves"), `R ${Math.min(...tr.curves.map((c) => c[2]))} m`]);
  // attributes from the network map: shares by length
  const pieces = network.value?.lines.find((x) => x.id === l.id)?.pieces ?? [];
  if (pieces.length) {
    const len = pieces.map((p) => ({ p, len: lenKm(decodePolyline(p.line)) }));
    const total = len.reduce((a, x) => a + x.len, 0) || 1;
    const share = (f: (p: (typeof pieces)[number]) => boolean) =>
      len.filter((x) => f(x.p)).reduce((a, x) => a + x.len, 0) / total;
    out.push([t("vzg.netElectrification"), pct(share((p) => p.e === true))]);
    const e2 = share((p) => p.etcs === 2);
    const e1 = share((p) => p.etcs === 1);
    const pzb = share((p) => p.pzb === true);
    out.push([
      t("vzg.profProtection"),
      [e2 && `ETCS L2 ${pct(e2)}`, e1 && `ETCS L1 ${pct(e1)}`, pzb && `PZB ${pct(pzb)}`]
        .filter(Boolean)
        .join(" · ") || "–",
    ]);
    // only where detected: both computed directions often run on the same OSM ways, so 0 % is
    // more likely a gap in the detection than a single-track line
    const double = share((p) => p.tr === 2);
    if (l.tracks.length > 1 && double > 0) out.push([t("vzg.profDouble"), pct(double)]);
  }
  if (l.gauge) out.push([t("vzg.netGauge"), `${l.gauge} mm`]);
  // elevation of the stations
  const eles = tr.points.filter((p) => p.ele !== undefined).map((p) => p.ele!);
  if (eles.length >= 2)
    out.push([t("vzg.profEle"), `${Math.min(...eles)} – ${Math.max(...eles)} m ü. A.`]);
  // trains per day (reference day)
  const dl = density.value?.lines.find((x) => x.id === l.id);
  if (dl?.n.length)
    out.push([
      t("vzg.netDensity"),
      t("vzg.profDensityValue", {
        max: Math.max(...dl.n),
        avg: Math.round(dl.n.reduce((a, n) => a + n, 0) / dl.n.length),
        day: density.value!.day,
      }),
    ]);
  if (l.connections?.length)
    out.push([
      t("vzg.connections"),
      String(new Set(l.connections.flatMap((c) => c.lines.map((o) => o.id))).size),
    ]);
  return out;
});
</script>

<template>
  <section class="my-3">
    <h2 class="m-0 mb-1 text-base">{{ $t("vzg.profile") }}</h2>
    <dl class="profile m-0 grid gap-x-4 gap-y-0.5 text-sm">
      <template v-for="[k, v] in rows" :key="k">
        <dt class="muted">{{ k }}</dt>
        <dd class="m-0">{{ v }}</dd>
      </template>
    </dl>
  </section>
</template>

<style scoped>
.profile {
  grid-template-columns: max-content 1fr;
}
</style>
