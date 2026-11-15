<script setup lang="ts">
// Line map (`/vzg/:line/map`): a print- and Wikipedia-ready vector map of one line — drawn here
// as SVG from the OSM-derived VzG data (no map tiles): the line with its tunnels, stations, km
// posts and connecting lines, the surrounding railway network, scale bar, north arrow, title,
// legend and data sources inside the image. Fixed colours (not the app theme): the same on screen,
// in print and in the SVG download (fonts as recommended by Wikimedia Commons).
import type { VzgIndex, VzgLine, VzgPoint } from "@zugx/vzg";
import { decodePolyline } from "@zugx/vzg/geo";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "../i18n/index.ts";
import { download } from "../lib/svg-export.ts";
import { loadStations, nearestStations } from "../lib/stations.ts";

type Coord = [number, number];
const files = import.meta.glob<{ default: VzgLine }>("../../../../packages/vzg/data/*.toml");
const loaderOf = (name: string) =>
  Object.entries(files).find(([p]) => p.endsWith(`/${name}.toml`))?.[1] as
    | (() => Promise<{ default: unknown }>)
    | undefined;

const route = useRoute();
const router = useRouter();
/** SVG links: in-app navigation for plain clicks (Ctrl/⌘/middle click: new tab) */
function go(to: string, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  void router.push(to);
}
const { t, locale } = useI18n();
const id = computed(() => String(route.params.line ?? ""));
const line = shallowRef<VzgLine>();
const index = shallowRef<VzgIndex>();
const network = shallowRef<{ id: string; ref?: string; line: string }[]>([]);
const missing = ref(false);

onMounted(async () => {
  const [i, g] = await Promise.all([loaderOf("index")?.(), loaderOf("geometry")?.()]);
  index.value = i?.default as VzgIndex | undefined;
  network.value = (g?.default as { lines?: typeof network.value } | undefined)?.lines ?? [];
});
watch(
  id,
  async (s) => {
    line.value = undefined;
    missing.value = false;
    const l = s ? loaderOf(s) : undefined;
    if (!l) return void (missing.value = true);
    line.value = (await l()).default as VzgLine;
  },
  { immediate: true },
);

// ---- colours and fonts (print / Commons)
const C = {
  land: "#f7f6f2",
  frame: "#9aa0a6",
  line: "#c8102e",
  casing: "#ffffff",
  network: "#a7adb4",
  text: "#1f2328",
  muted: "#5b636c",
  station: "#ffffff",
};
const SANS = "Liberation Sans, Arial, Nimbus Sans L, Helvetica, sans-serif";

// ---- layout
const W = 1000;
const HEAD = 78; // title block
const FOOT_BASE = 74; // legend + sources
const FOOT = computed(() => FOOT_BASE + (bySpeed.value ? 30 : 0));

// ---- colour mode: one colour, or by permitted speed (?farbe=v). Scale: ColorBrewer RdYlBu,
// 9 classes (colorbrewer2.org; ordered, colour-blind safe), red = slow → blue = fast; the pale
// middle classes get a dark edge on the light background
const bySpeed = computed(() => route.query.farbe === "v");
const SPEED_BINS = [40, 60, 80, 100, 120, 140, 160, 200, Infinity];
const SPEED_COLORS = [
  "#d73027",
  "#f46d43",
  "#fdae61",
  "#fee090",
  "#ffffbf",
  "#e0f3f8",
  "#abd9e9",
  "#74add1",
  "#4575b4",
];
const NO_SPEED = "#9aa0a6";
const speedColor = (v?: number) =>
  v === undefined ? NO_SPEED : SPEED_COLORS[SPEED_BINS.findIndex((b) => v <= b)]!;
const speedLabel = (i: number) =>
  i === 0
    ? `≤ ${SPEED_BINS[0]}`
    : i === SPEED_BINS.length - 1
      ? `> ${SPEED_BINS[i - 1]}`
      : `≤ ${SPEED_BINS[i]}`;
function setMode(speed: boolean) {
  void router.replace({ query: { ...route.query, farbe: speed ? "v" : undefined } });
}
const PAD = 24;

const track = computed(() => line.value?.tracks[0]);
const segments = computed(
  () =>
    track.value?.geo?.segments.map((s) => ({
      tunnel: !!s.tunnel,
      v: s.v,
      pts: decodePolyline(s.line),
    })) ?? [],
);
const allPts = computed(() => segments.value.flatMap((s) => s.pts));

/** map frame: the line's bounding box + margin, aspect between 3:4 and 16:9 */
const view = computed(() => {
  const pts = allPts.value;
  if (!pts.length) return undefined;
  let [s, n, w, e] = [90, -90, 180, -180];
  for (const [la, lo] of pts) {
    s = Math.min(s, la);
    n = Math.max(n, la);
    w = Math.min(w, lo);
    e = Math.max(e, lo);
  }
  const lat0 = ((s + n) / 2) * (Math.PI / 180);
  const kx = Math.cos(lat0);
  // in "km-like" units: x = lon·cos(lat0), y = lat
  let wx = (e - w) * kx;
  let hy = n - s;
  const m = Math.max(wx, hy) * 0.12 + 0.01;
  wx += 2 * m;
  hy += 2 * m;
  // aspect: width/height within [0.75, 1.78]
  const aspect = Math.min(1.78, Math.max(0.75, wx / hy));
  if (wx / hy < aspect) wx = hy * aspect;
  else hy = wx / aspect;
  const cx = ((w + e) / 2) * kx;
  const cy = (s + n) / 2;
  const mapW = W - 2 * PAD;
  const mapH = Math.round(mapW / aspect);
  const k = mapW / wx;
  return {
    kx,
    mapW,
    mapH,
    x: (lo: number) => PAD + (lo * kx - (cx - wx / 2)) * k,
    y: (la: number) => HEAD + (cy + hy / 2 - la) * k,
    /** km per map unit (1° latitude ≈ 111.32 km) */
    kmPerPx: 111.32 / k,
    bbox: { s: cy - hy / 2, n: cy + hy / 2, w: (cx - wx / 2) / kx, e: (cx + wx / 2) / kx },
  };
});
const H = computed(() => (view.value ? HEAD + view.value.mapH + FOOT.value : 400));
const path = (pts: Coord[]) => {
  const v = view.value!;
  return pts
    .map(([la, lo], i) => `${i ? "L" : "M"}${v.x(lo).toFixed(1)},${v.y(la).toFixed(1)}`)
    .join("");
};

// ---- surrounding network (other lines in the frame)
const context = computed(() => {
  const v = view.value;
  if (!v) return [];
  const b = v.bbox;
  return network.value
    .filter((l) => l.id !== id.value)
    .map((l) => decodePolyline(l.line))
    .filter((pts) => pts.some(([la, lo]) => la > b.s && la < b.n && lo > b.w && lo < b.e))
    .map(path);
});

// ---- km posts (?km=1, off by default): every 1/2/5/10/20/50 km, about a dozen along the line
const showKm = computed(() => route.query.km === "1");
function toggleKm() {
  void router.replace({ query: { ...route.query, km: showKm.value ? undefined : "1" } });
}
const postList = computed(() => {
  if (!showKm.value) return [];
  const v = view.value;
  const ps = track.value?.geo?.posts ?? [];
  if (!v || ps.length < 2) return [];
  const span = Math.abs(ps.at(-1)![0] - ps[0]![0]);
  const step = [1, 2, 5, 10, 20, 50].find((s) => span / s <= 14) ?? 100;
  return ps.filter(([k]) => k % step === 0).map(([k, la, lo]) => ({ k, x: v.x(lo), y: v.y(la) }));
});

// ---- links: station → its departure board (HAFAS id = OSM uic_ref, else the nearest station
// of the station index within 300 m); connecting line → its map
const stationsReady = ref(false);
onMounted(async () => {
  await loadStations();
  stationsReady.value = true;
});
function stationId(p: VzgPoint & { pos: Coord }): string | undefined {
  if (p.uic) return p.uic;
  if (!stationsReady.value) return undefined;
  const n = nearestStations(p.pos[0], p.pos[1], 1)[0];
  return n && n.dist <= 300 ? n.id : undefined;
}
const SUB_CHAR = 5.3; // average glyph width at 9.5 px
/** "↗ 222 01, 101 04" as separate links, laid out like the one text they replace */
function subLinks(
  others: { id: string; ref?: string; name?: string }[],
  x: number,
  anchor: Label["anchor"],
  chars: number,
) {
  const total = chars * SUB_CHAR;
  let cx = anchor === "start" ? x : anchor === "end" ? x - total : x - total / 2;
  return others.map((o, i) => {
    const text = `${i ? ", " : "↗ "}${o.ref ?? o.name ?? o.id}`;
    const item = { text, id: o.id, x: cx };
    cx += text.length * SUB_CHAR;
    return item;
  });
}

// ---- stations and labels (greedy, no overlaps)
interface Label {
  x: number;
  y: number;
  anchor: "start" | "end" | "middle";
  text: string;
  /** HAFAS station id: the label links to its departure board */
  station?: string;
  /** connecting lines under the name, each linking to its map */
  subs?: { text: string; id: string; x: number }[];
  bold: boolean;
}
const CHAR = 6.1; // average glyph width at 11 px
const stations = computed(() => {
  const v = view.value;
  const tr = track.value;
  if (!v || !tr) return { dots: [], labels: [] as Label[], kmLabels: [] };
  // one entry per place: "Salzburg Hauptbahnhof (S-Bahn)" = "Salzburg Hauptbahnhof", and names
  // within 300 m where one contains the other ("Sonnenburgerhof" / "Innsbruck Sonnenburgerhof")
  const clean = (n: string) => n.replace(/\s*\([^)]*\)/g, "").trim();
  const near = (a: Coord, b: Coord) =>
    Math.abs(a[0] - b[0]) < 0.003 && Math.abs(a[1] - b[1]) < 0.004;
  const pts: (VzgPoint & { pos: Coord; label: string })[] = [];
  for (const p of tr.points) {
    if (!p.pos || !p.label || !(p.kind === "station" || p.kind === "halt" || p.kind === "stop"))
      continue;
    const label = clean(p.label);
    const dup = pts.find(
      (q) =>
        q.label === label ||
        (near(q.pos, p.pos!) && (q.label.includes(label) || label.includes(q.label))),
    );
    if (!dup) pts.push({ ...p, pos: p.pos, label });
    else {
      // keep the longer name and the "bigger" kind
      if (label.length > dup.label.length) dup.label = label;
      if (p.kind === "station") dup.kind = "station";
    }
  }
  const ends = new Set([pts[0]?.label, pts.at(-1)?.label]);
  const conn = new Map((line.value?.connections ?? []).map((c) => [c.station, c]));
  const dots = pts.map((p) => ({
    x: v.x(p.pos[1]),
    y: v.y(p.pos[0]),
    big: p.kind === "station" || ends.has(p.label),
  }));
  // occupied boxes: the line itself is not checked (labels may touch it), other labels are
  const boxes: [number, number, number, number][] = [];
  const free = (b: [number, number, number, number]) =>
    b[0] >= PAD &&
    b[2] <= W - PAD &&
    b[1] >= HEAD &&
    b[3] <= HEAD + v.mapH &&
    boxes.every((o) => b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]);
  const labels: Label[] = [];
  // ends first, then stations (Bahnhöfe), then halts
  const order = [
    ...pts.filter((p) => ends.has(p.label)),
    ...pts.filter((p) => !ends.has(p.label) && p.kind === "station"),
    ...pts.filter((p) => !ends.has(p.label) && p.kind !== "station"),
  ];
  for (const p of order) {
    const x = v.x(p.pos[1]);
    const y = v.y(p.pos[0]);
    const c = conn.get(p.label);
    const others = (c?.lines ?? []).slice(0, 3);
    const sub = others.length ? `↗ ${others.map((o) => o.ref ?? o.name).join(", ")}` : undefined;
    const w = Math.max(p.label.length, (sub?.length ?? 0) + 2) * CHAR + 4;
    const h = sub ? 26 : 13;
    const tries: [number, number, Label["anchor"]][] = [
      [x + 7, y - h / 2, "start"],
      [x - 7 - w, y - h / 2, "end"],
      [x - w / 2, y - 8 - h, "middle"],
      [x - w / 2, y + 8, "middle"],
    ];
    for (const [bx, by, anchor] of tries) {
      const box: [number, number, number, number] = [bx, by, bx + w, by + h];
      if (!free(box)) continue;
      boxes.push(box);
      const tx = anchor === "start" ? bx : anchor === "end" ? bx + w : bx + w / 2;
      labels.push({
        x: tx,
        y: by + 10,
        anchor,
        text: p.label,
        bold: ends.has(p.label),
        ...(stationId(p) ? { station: stationId(p) } : {}),
        ...(sub ? { subs: subLinks(others, tx, anchor, sub.length) } : {}),
      });
      break;
    }
  }
  // km post labels where there is room
  const kmLabels: { x: number; y: number; k: number }[] = [];
  for (const p of postList.value) {
    const w = String(p.k).length * 6 + 2;
    const box: [number, number, number, number] = [p.x + 3, p.y + 2, p.x + 3 + w, p.y + 12];
    if (!free(box)) continue;
    boxes.push(box);
    kmLabels.push(p);
  }
  return { dots, labels, kmLabels };
});

// ---- scale bar
const scale = computed(() => {
  const v = view.value;
  if (!v) return undefined;
  const target = (v.mapW / 5) * v.kmPerPx;
  const km = [1, 2, 5, 10, 20, 25, 50, 100].reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a,
  );
  return { km, px: km / v.kmPerPx };
});

const kmText = (km: number, d = 1) =>
  km.toLocaleString(locale.value, { minimumFractionDigits: d, maximumFractionDigits: d });
const title = computed(() => line.value?.name ?? line.value?.ref ?? id.value);
const subtitle = computed(() => {
  const l = line.value;
  const tr = track.value;
  if (!l || !tr) return "";
  return [
    l.ref ? `${t("vzg.line")} ${l.ref}` : "",
    [l.from, l.to].filter(Boolean).join(" – "),
    `${kmText(tr.length)} km`,
    l.gauge && l.gauge !== "1435" ? `${l.gauge} mm` : "",
    l.operator,
    bySpeed.value ? t("vzg.mapSpeedSubtitle") : "",
  ]
    .filter(Boolean)
    .join(" · ");
});
const url = computed(() => `${location.origin}/vzg/${id.value}/map`);

const svgEl = ref<SVGSVGElement>();
function exportSvg() {
  if (!svgEl.value || !line.value) return;
  // the drawing uses attributes only; drop the app's classes/ARIA on the root, fix the size
  const svg = svgEl.value.cloneNode(true) as SVGSVGElement;
  for (const a of ["class", "role", "aria-label"]) svg.removeAttribute(a);
  // app links mean nothing on Commons / in print files
  for (const el of svg.querySelectorAll("a")) {
    el.removeAttribute("href");
    el.removeAttribute("class");
  }
  // document title as metadata in the file (not on screen: it would be a tooltip over everything)
  const meta = document.createElementNS("http://www.w3.org/2000/svg", "title");
  meta.textContent = `${title.value} – ${subtitle.value}`;
  svg.prepend(meta);
  const xml = new XMLSerializer().serializeToString(svg);
  const name = [line.value.ref, line.value.name].filter(Boolean).join(" ") || id.value;
  download(
    `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`,
    `zugx_Karte_${name.replace(/[^\p{L}\p{N}]+/gu, "_")}${bySpeed.value ? "_Geschwindigkeit" : ""}.svg`,
  );
}
const print = () => window.print();
</script>

<template>
  <section class="vzg-map">
    <div class="no-print mb-2 flex flex-wrap items-center gap-2">
      <h1 class="m-0 text-xl">
        <RouterLink :to="`/vzg/${id}`" class="text-[var(--fg)]">{{
          $t("vzg.mapTitle")
        }}</RouterLink>
      </h1>
      <span class="muted text-sm">{{ title }}</span>
      <span class="ml-auto flex gap-1 text-xs">
        <RouterLink :to="`/vzg/${id}`" class="btn">← {{ $t("vzg.title") }}</RouterLink>
        <button
          class="btn"
          :class="!bySpeed && 'btn-on'"
          :aria-pressed="!bySpeed"
          @click="setMode(false)"
        >
          {{ $t("vzg.mapColorPlain") }}
        </button>
        <button
          class="btn"
          :class="bySpeed && 'btn-on'"
          :aria-pressed="bySpeed"
          @click="setMode(true)"
        >
          {{ $t("vzg.mapColorSpeed") }}
        </button>
        <label class="flex items-center gap-1">
          <input type="checkbox" :checked="showKm" @change="toggleKm" />
          {{ $t("vzg.mapLegendKm") }}
        </label>
        <button class="btn" v-tip="$t('vzg.exportTip')" @click="exportSvg">⤓ SVG</button>
        <button class="btn" @click="print">⎙ {{ $t("vzg.print") }}</button>
      </span>
    </div>
    <p v-if="missing" class="muted">{{ $t("vzg.noData") }}</p>
    <div v-else-if="line && view" class="map-card overflow-x-auto">
      <svg
        ref="svgEl"
        xmlns="http://www.w3.org/2000/svg"
        :viewBox="`0 0 ${W} ${H}`"
        :width="W"
        :height="H"
        :font-family="SANS"
        role="img"
        :aria-label="`${title} – ${subtitle}`"
        class="block h-auto max-w-full"
      >
        <rect :width="W" :height="H" fill="#ffffff" />
        <!-- title block -->
        <text :x="PAD" y="34" font-size="22" font-weight="700" :fill="C.text">{{ title }}</text>
        <text :x="PAD" y="58" font-size="12" :fill="C.muted">{{ subtitle }}</text>
        <!-- map -->
        <defs>
          <clipPath id="map-clip">
            <rect :x="PAD" :y="HEAD" :width="view.mapW" :height="view.mapH" />
          </clipPath>
        </defs>
        <rect
          :x="PAD"
          :y="HEAD"
          :width="view.mapW"
          :height="view.mapH"
          :fill="C.land"
          :stroke="C.frame"
          stroke-width="0.8"
        />
        <g clip-path="url(#map-clip)" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path
            v-for="(d, i) in context"
            :key="`n${i}`"
            :d="d"
            :stroke="C.network"
            stroke-width="1.4"
          />
          <!-- the line: white casing, red, tunnels dashed -->
          <path
            v-for="(s, i) in segments"
            :key="`c${i}`"
            :d="path(s.pts)"
            :stroke="bySpeed ? '#3a3f45' : C.casing"
            :stroke-width="bySpeed ? 8 : 7"
          />
          <path
            v-for="(s, i) in segments"
            :key="`l${i}`"
            :d="path(s.pts)"
            :stroke="bySpeed ? speedColor(s.v) : C.line"
            :stroke-width="bySpeed ? (s.tunnel ? 4 : 5.4) : s.tunnel ? 3 : 4"
            :stroke-dasharray="s.tunnel ? '5 3' : undefined"
            :stroke-linecap="s.tunnel ? 'butt' : 'round'"
          />
        </g>
        <g clip-path="url(#map-clip)">
          <!-- km posts -->
          <circle v-for="p in postList" :key="`k${p.k}`" :cx="p.x" :cy="p.y" r="2" :fill="C.text" />
          <text
            v-for="p in stations.kmLabels"
            :key="`kt${p.k}`"
            :x="p.x + 4"
            :y="p.y + 11"
            font-size="9"
            :fill="C.muted"
            font-family="Liberation Mono, Courier New, Courier, monospace"
            paint-order="stroke"
            stroke="#ffffff"
            stroke-width="2.5"
          >
            {{ p.k }}
          </text>
          <!-- stations -->
          <circle
            v-for="(d, i) in stations.dots"
            :key="`s${i}`"
            :cx="d.x"
            :cy="d.y"
            :r="d.big ? 4.2 : 2.6"
            :fill="C.station"
            :stroke="C.text"
            :stroke-width="d.big ? 1.6 : 1.2"
          />
          <g v-for="(l, i) in stations.labels" :key="`t${i}`">
            <a
              v-if="l.station"
              :href="`/station/${l.station}`"
              class="map-link"
              @click="go(`/station/${l.station}`, $event)"
            >
              <text
                :x="l.x"
                :y="l.y"
                :text-anchor="l.anchor"
                font-size="11"
                :font-weight="l.bold ? 700 : 400"
                :fill="C.text"
                paint-order="stroke"
                stroke="#ffffff"
                stroke-width="3"
                stroke-linejoin="round"
              >
                {{ l.text }}
              </text>
            </a>
            <text
              v-else
              :x="l.x"
              :y="l.y"
              :text-anchor="l.anchor"
              font-size="11"
              :font-weight="l.bold ? 700 : 400"
              :fill="C.text"
              paint-order="stroke"
              stroke="#ffffff"
              stroke-width="3"
              stroke-linejoin="round"
            >
              {{ l.text }}
            </text>
            <a
              v-for="o in l.subs ?? []"
              :key="o.id"
              :href="`/vzg/${o.id}/map`"
              class="map-link"
              @click="go(`/vzg/${o.id}/map`, $event)"
            >
              <text
                :x="o.x"
                :y="l.y + 12"
                font-size="9.5"
                :fill="C.muted"
                paint-order="stroke"
                stroke="#ffffff"
                stroke-width="3"
                stroke-linejoin="round"
              >
                {{ o.text }}
              </text>
            </a>
          </g>
        </g>
        <!-- north arrow -->
        <g :transform="`translate(${PAD + view.mapW - 26} ${HEAD + 34})`">
          <path d="M0,-22 L7,0 L0,-5 L-7,0 Z" :fill="C.text" />
          <text y="14" text-anchor="middle" font-size="12" font-weight="700" :fill="C.text">N</text>
        </g>
        <!-- scale bar -->
        <g v-if="scale" :transform="`translate(${PAD + 14} ${HEAD + view.mapH - 18})`">
          <rect :width="scale.px" height="5" fill="#ffffff" :stroke="C.text" stroke-width="1" />
          <rect :width="scale.px / 2" height="5" :fill="C.text" />
          <text y="-4" font-size="10" :fill="C.text">0</text>
          <text :x="scale.px" y="-4" text-anchor="middle" font-size="10" :fill="C.text">
            {{ scale.km }} km
          </text>
        </g>
        <!-- legend -->
        <g :transform="`translate(${PAD} ${HEAD + view.mapH + 22})`" font-size="11" :fill="C.text">
          <template v-if="!bySpeed">
            <line x1="0" x2="26" y1="-4" y2="-4" :stroke="C.line" stroke-width="4" />
            <text x="32">{{ $t("vzg.mapLegendLine") }}</text>
          </template>
          <line
            x1="170"
            x2="196"
            y1="-4"
            y2="-4"
            :stroke="bySpeed ? '#3a3f45' : C.line"
            stroke-width="3"
            stroke-dasharray="5 3"
          />
          <text x="202">{{ $t("vzg.mapLegendTunnel") }}</text>
          <line x1="290" x2="316" y1="-4" y2="-4" :stroke="C.network" stroke-width="1.6" />
          <text x="322">{{ $t("vzg.mapLegendNetwork") }}</text>
          <circle cx="470" cy="-4" r="4.2" fill="#fff" :stroke="C.text" stroke-width="1.6" />
          <text x="480">{{ $t("vzg.kind.station") }}</text>
          <circle cx="560" cy="-4" r="2.6" fill="#fff" :stroke="C.text" stroke-width="1.2" />
          <text x="568">{{ $t("vzg.kind.halt") }}</text>
          <template v-if="showKm">
            <circle cx="660" cy="-4" r="2" :fill="C.text" />
            <text x="668">{{ $t("vzg.mapLegendKm") }}</text>
          </template>
        </g>
        <!-- speed scale (colour mode "by speed") -->
        <g
          v-if="bySpeed"
          :transform="`translate(${PAD} ${HEAD + view.mapH + 46})`"
          font-size="10"
          :fill="C.text"
        >
          <text y="0">{{ $t("vzg.mapSpeedScale") }}</text>
          <g v-for="(c, i) in SPEED_COLORS" :key="c" :transform="`translate(${190 + i * 58} 0)`">
            <rect y="-9" width="22" height="10" :fill="c" stroke="#3a3f45" stroke-width="0.8" />
            <text x="26">{{ speedLabel(i) }}</text>
          </g>
          <g :transform="`translate(${190 + 9 * 58} 0)`">
            <rect
              y="-9"
              width="22"
              height="10"
              :fill="NO_SPEED"
              stroke="#3a3f45"
              stroke-width="0.8"
            />
            <text x="26">{{ $t("vzg.mapSpeedUnknown") }}</text>
          </g>
        </g>
        <!-- sources -->
        <text
          :x="PAD"
          :y="HEAD + view.mapH + 46 + (bySpeed ? 30 : 0)"
          font-size="9.5"
          :fill="C.muted"
        >
          {{ $t("vzg.mapSources", { date: index?.osmDate ?? index?.created ?? "" }) }}
        </text>
        <text
          :x="PAD"
          :y="HEAD + view.mapH + 60 + (bySpeed ? 30 : 0)"
          font-size="9.5"
          :fill="C.muted"
        >
          {{ $t("vzg.exportMadeWith", { url }) }}
        </text>
      </svg>
    </div>
  </section>
</template>

<style>
.vzg-map .map-link {
  cursor: pointer;
}
.vzg-map .map-link:hover text {
  text-decoration: underline;
}
/* print: only the map, full page width */
@media print {
  header,
  footer,
  .no-print,
  .skip-link {
    display: none !important;
  }
  main {
    max-width: none !important;
    padding: 0 !important;
  }
  .vzg-map .map-card svg {
    width: 100% !important;
    height: auto !important;
  }
  @page {
    margin: 12mm;
  }
}
</style>
