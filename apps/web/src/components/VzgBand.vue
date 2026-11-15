<script setup lang="ts">
// Streckenband: the line as a schematic strip, after Wikipedia's route diagrams (BS icons) — one
// row per station, bridge and tunnel in the direction of travel: km, name, remarks, elevation;
// connecting lines at the junctions. Drawn as SVG with fixed colours (download, snapshot tests).
import type { VzgLine, VzgPoint, VzgTrack } from "@zugx/vzg";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "../i18n/index.ts";
import { loadStations, nearestStations } from "../lib/stations.ts";

const props = defineProps<{ line: VzgLine; track: VzgTrack; increasing: boolean }>();
const { t, locale } = useI18n();
const router = useRouter();

const W = 640;
const ROW = 24;
const TOP = 12;
const X = { strip: 34, km: 122, name: 134, ele: W - 10 };
const C = { line: "#be1e2d", faint: "#e2a2a8", text: "#1f2328", muted: "#5b636c", link: "#0b5cad" };
const SANS = "Liberation Sans, Arial, Nimbus Sans L, Helvetica, sans-serif";

type Row =
  | { kind: "station" | "halt"; km: number; name: string; ele?: number; id?: string }
  | { kind: "bridge" | "tunnel"; km: number; kmTo: number; name?: string; length: number }
  | { kind: "connection"; km: number; text: string; to: string };

const stationsReady = ref(false);
onMounted(async () => {
  await loadStations();
  stationsReady.value = true;
});
/** HAFAS station id: OSM uic_ref, else the nearest station of the index within 300 m */
function stationId(p: VzgPoint): string | undefined {
  if (p.uic) return p.uic;
  if (!stationsReady.value || !p.pos) return undefined;
  const n = nearestStations(p.pos[0], p.pos[1], 1)[0];
  return n && n.dist <= 300 ? n.id : undefined;
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  // stations: one per place ("… (S-Bahn)" and stop positions merged), station beats halt
  const clean = (n: string) => n.replace(/\s*\([^)]*\)/g, "").trim();
  const seen = new Map<string, Row & { kind: "station" | "halt" }>();
  for (const p of props.track.points) {
    if (!p.label || !(p.kind === "station" || p.kind === "halt" || p.kind === "stop")) continue;
    const name = clean(p.label);
    const old = seen.get(name);
    if (old) {
      if (p.kind === "station") old.kind = "station";
      if (old.ele === undefined && p.ele !== undefined) old.ele = p.ele;
      continue;
    }
    const id = stationId(p);
    const r = {
      kind: p.kind === "station" ? ("station" as const) : ("halt" as const),
      km: p.km,
      name,
      ...(p.ele !== undefined ? { ele: p.ele } : {}),
      ...(id ? { id } : {}),
    };
    seen.set(name, r);
    out.push(r);
  }
  // bridges from 20 m (the culverts would crowd the band), tunnels from 50 m (the data's limit)
  for (const s of props.track.structures ?? []) {
    if (s.kind === "bridge" && s.length < 20) continue;
    out.push({
      kind: s.kind,
      km: s.kmFrom,
      kmTo: s.kmTo,
      length: s.length,
      ...(s.name ? { name: s.name } : {}),
    });
  }
  for (const c of props.line.connections ?? [])
    for (const o of c.lines)
      out.push({
        kind: "connection",
        km: c.km,
        text: [o.ref, o.name].filter(Boolean).join(" "),
        to: `/vzg/${o.id}`,
      });
  // direction of travel; at the same km: station, then its connections, then structures
  const order = { station: 0, halt: 0, connection: 1, bridge: 2, tunnel: 2 };
  return out.sort(
    (a, b) => (props.increasing ? a.km - b.km : b.km - a.km) || order[a.kind] - order[b.kind],
  );
});
const H = computed(() => TOP * 2 + rows.value.length * ROW);
const y = (i: number) => TOP + i * ROW + ROW / 2;

const kmText = (km: number) =>
  km.toLocaleString(locale.value, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const structureText = (r: Row & { kind: "bridge" | "tunnel" }) =>
  `${r.name ?? t(r.kind === "bridge" ? "vzg.bandBridge" : "vzg.bandTunnel")} (L ${r.length} m)`;

function go(to: string, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  void router.push(to);
}

const svg = ref<SVGSVGElement>();
defineExpose({ svg });
</script>

<template>
  <svg
    ref="svg"
    :viewBox="`0 0 ${W} ${H}`"
    :width="W"
    :height="H"
    :font-family="SANS"
    class="vzg-band block h-auto max-w-full"
    role="img"
    :aria-label="`${$t('vzg.band')} ${line.ref ?? ''} ${line.name ?? ''}`"
  >
    <rect :width="W" :height="H" fill="#ffffff" />
    <!-- the strip: one line through all rows; tunnels dashed over their rows -->
    <line :x1="X.strip" :x2="X.strip" :y1="TOP" :y2="H - TOP" :stroke="C.line" stroke-width="4" />
    <g v-for="(r, i) in rows" :key="i" font-size="13">
      <template v-if="r.kind === 'station' || r.kind === 'halt'">
        <circle :cx="X.strip" :cy="y(i)" :r="r.kind === 'station' ? 7 : 4" :fill="C.line" />
        <text :x="X.km" :y="y(i) + 4.5" text-anchor="end" :fill="C.text">{{ kmText(r.km) }}</text>
        <a v-if="r.id" :href="`/station/${r.id}`" @click="go(`/station/${r.id}`, $event)">
          <text
            :x="X.name"
            :y="y(i) + 5"
            :font-size="r.kind === 'station' ? 15 : 14"
            :fill="C.link"
          >
            {{ r.name }}
          </text>
        </a>
        <text
          v-else
          :x="X.name"
          :y="y(i) + 5"
          :font-size="r.kind === 'station' ? 15 : 14"
          :fill="C.text"
        >
          {{ r.name }}
        </text>
        <text
          v-if="r.ele !== undefined"
          :x="X.ele"
          :y="y(i) + 4.5"
          text-anchor="end"
          :fill="C.text"
        >
          {{ r.ele }} m ü. A.
        </text>
      </template>
      <template v-else-if="r.kind === 'bridge'">
        <!-- bridge: brackets left and right of the strip -->
        <path
          :d="`M${X.strip - 9},${y(i) - 8} q5,8 0,16 M${X.strip + 9},${y(i) - 8} q-5,8 0,16`"
          fill="none"
          :stroke="C.muted"
          stroke-width="1.6"
        />
        <text :x="X.km" :y="y(i) + 4.5" text-anchor="end" :fill="C.text">{{ kmText(r.km) }}</text>
        <text :x="X.name" :y="y(i) + 4.5" :fill="C.text">{{ structureText(r) }}</text>
      </template>
      <template v-else-if="r.kind === 'tunnel'">
        <!-- tunnel: the strip dashed over the row, portals as short bars -->
        <rect :x="X.strip - 4" :y="y(i) - ROW / 2" width="8" :height="ROW" fill="#ffffff" />
        <line
          :x1="X.strip"
          :x2="X.strip"
          :y1="y(i) - ROW / 2"
          :y2="y(i) + ROW / 2"
          :stroke="C.line"
          stroke-width="4"
          stroke-dasharray="3 3"
        />
        <text :x="X.km" :y="y(i) + 4.5" text-anchor="end" :fill="C.text">{{ kmText(r.km) }}</text>
        <text :x="X.name" :y="y(i) + 4.5" :fill="C.text">{{ structureText(r) }}</text>
      </template>
      <template v-else-if="r.kind === 'connection'">
        <!-- connecting line: a branch off the strip -->
        <path
          :d="`M${X.strip},${y(i) - ROW / 2} q0,${ROW / 2} -16,${ROW / 2}`"
          fill="none"
          :stroke="C.line"
          stroke-width="3"
        />
        <a :href="r.to" @click="go(r.to, $event)">
          <text :x="X.name" :y="y(i) + 4.5" :fill="C.link">↔ {{ r.text }}</text>
        </a>
      </template>
    </g>
  </svg>
</template>
