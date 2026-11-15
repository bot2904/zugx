<script setup lang="ts">
// Infrastructure network map (`/vzg/netz`): all VzG lines of the selected country as a vector map, coloured by an attribute —
// permitted speed, electrification, ETCS, PZB, track count, gauge or operator (`?attr=`). Drawn
// from `packages/vzg/data/network.toml` (OSM, ODbL); fixed colours (ColorBrewer), print and SVG.
import type { NetPiece, VzgBoundaries, VzgIndex, VzgNetwork } from "@zugx/vzg";
import { decodePolyline } from "@zugx/vzg/geo";
import { computed, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "../i18n/index.ts";
import { usePageTitle } from "../lib/title.ts";
import { COUNTRIES, country } from "../lib/country.ts";
import { densityOf, vzgFile } from "../lib/vzg-data.ts";
import { download } from "../lib/svg-export.ts";
import type { TipContent } from "../lib/tip.ts";

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const network = shallowRef<VzgNetwork>();
const index = shallowRef<VzgIndex>();
const boundaries = shallowRef<VzgBoundaries>();
// trains per day per km section (netz build, GTFS reference day)
interface Density {
  day: string;
  lines: { id: string; km: number[]; n: number[] }[];
}
const density = shallowRef<Density>();
// the selected country's network (navbar)
watch(
  country,
  async (c) => {
    [network.value, index.value, density.value, boundaries.value] = await Promise.all([
      vzgFile<VzgNetwork>("network", c),
      vzgFile<VzgIndex>("index", c),
      densityOf<Density>(c),
      vzgFile<VzgBoundaries>("boundaries", c),
    ]);
  },
  { immediate: true },
);
/** density classes: ColorBrewer YlOrRd (6), width growing with the trains per day */
const DENSITY_BINS = [10, 25, 50, 100, 200, Infinity];
const DENSITY_COLORS = ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];
const DENSITY_WIDTHS = [1.6, 2.2, 2.8, 3.6, 4.6, 6];
const densityClass = (n: number) => DENSITY_BINS.findIndex((b) => n <= b);
/** per line: segments between consecutive km posts with their trains per day */
const densitySegments = computed(() => {
  if (attr.value !== "density" || !density.value || !view.value) return [];
  const byLine = new Map(density.value.lines.map((l) => [l.id, l]));
  const out: { id: string; label: string; d: string; n: number; color: string; width: number }[] =
    [];
  for (const l of network.value?.lines ?? []) {
    const dl = byLine.get(l.id);
    if (!dl || !l.posts) continue;
    const nAt = new Map(dl.km.map((k, i) => [k, dl.n[i]!]));
    const pts = decodePolyline(l.posts.line);
    const km = l.posts.km;
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(km[i]! - km[i - 1]!) !== 1) continue;
      const n = nAt.get(Math.min(km[i]!, km[i - 1]!));
      if (!n) continue;
      const c = densityClass(n);
      out.push({
        id: l.id,
        label: [l.ref, l.name].filter(Boolean).join(" ") || l.id,
        d: d([pts[i - 1]!, pts[i]!]),
        n,
        color: DENSITY_COLORS[c]!,
        width: DENSITY_WIDTHS[c]! * widthScale.value,
      });
    }
  }
  return out.sort((a, b) => a.n - b.n);
});

// ---- attributes and their colours (ColorBrewer: RdYlBu for speed, Dark2/Set1 categorical)
const ATTRS = [
  "speed",
  "density",
  "electrified",
  "etcs",
  "pzb",
  "tracks",
  "gauge",
  "operator",
] as const;
type Attr = (typeof ATTRS)[number];
const attr = computed<Attr>(() =>
  ATTRS.includes(route.query.attr as Attr) ? (route.query.attr as Attr) : "speed",
);
const setAttr = (a: Attr) =>
  void router.replace({ query: { ...route.query, attr: a === "speed" ? undefined : a } });

const GREY = "#b8bcc2";
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
const GAUGES: Record<string, string> = {
  "1435": "#4d4d4d",
  "1000": "#1b9e77",
  "760": "#d95f02",
  "900": "#7570b3",
};
const OPERATOR_COLORS = [
  "#c8102e",
  "#1b9e77",
  "#d95f02",
  "#7570b3",
  "#e7298a",
  "#66a61e",
  "#e6ab02",
  "#a6761d",
];
/** operators by network length, the biggest get their own colour */
const operators = computed(() => {
  const len = new Map<string, number>();
  for (const l of network.value?.lines ?? [])
    len.set(l.operator ?? "?", (len.get(l.operator ?? "?") ?? 0) + l.pieces.length);
  return [...len]
    .filter(([o]) => o !== "?")
    .sort((a, b) => b[1] - a[1])
    .slice(0, OPERATOR_COLORS.length)
    .map(([o], i) => [o, OPERATOR_COLORS[i]!] as const);
});

interface Style {
  color: string;
  width: number;
  /** legend key */
  key: string;
}
function style(p: NetPiece, operator?: string): Style {
  switch (attr.value) {
    case "density":
      // the base network thin and grey, the densities drawn on top
      return { color: "#d5d8dc", width: 1.2, key: "base" };
    case "speed": {
      if (p.v === undefined) return { color: GREY, width: 1.4, key: "?" };
      const i = SPEED_BINS.findIndex((b) => p.v! <= b);
      return { color: SPEED_COLORS[i]!, width: 2.2, key: String(i) };
    }
    case "electrified":
      return p.e === undefined
        ? { color: GREY, width: 1.4, key: "?" }
        : p.e
          ? { color: "#2166ac", width: 2.2, key: "yes" }
          : { color: "#e08214", width: 2.2, key: "no" };
    case "etcs":
      return p.etcs === 2
        ? { color: "#1b9e77", width: 2.6, key: "2" }
        : p.etcs === 1
          ? { color: "#d95f02", width: 2.6, key: "1" }
          : { color: GREY, width: 1.4, key: "no" };
    case "pzb":
      return p.pzb
        ? { color: "#7570b3", width: 2.2, key: "yes" }
        : p.pzb === false
          ? { color: "#e7298a", width: 2.2, key: "no" }
          : { color: GREY, width: 1.4, key: "?" };
    case "tracks":
      return p.tr === 2
        ? { color: "#1f2328", width: 3.2, key: "2" }
        : { color: "#7a828c", width: 1.3, key: "1" };
    case "gauge": {
      const c = GAUGES[p.g ?? ""];
      return c
        ? { color: c, width: p.g === "1435" ? 1.6 : 2.6, key: p.g! }
        : { color: p.g ? "#e7298a" : GREY, width: p.g ? 2.6 : 1.4, key: p.g ? "other" : "?" };
    }
    case "operator": {
      const c = operators.value.find(([o]) => o === operator)?.[1];
      return c
        ? { color: c, width: 2.2, key: operator! }
        : { color: GREY, width: 1.6, key: "other" };
    }
  }
}

/** legend entries of the current attribute: [colour, width, label] */
const legend = computed<[string, number, string][]>(() => {
  switch (attr.value) {
    case "density":
      return [
        ...DENSITY_COLORS.map(
          (c, i) =>
            [
              c,
              DENSITY_WIDTHS[i]!,
              i === DENSITY_BINS.length - 1
                ? `> ${DENSITY_BINS[i - 1]}`
                : `${i ? DENSITY_BINS[i - 1]! + 1 : 1}–${DENSITY_BINS[i]}`,
            ] as [string, number, string],
        ),
        ["#d5d8dc", 1.2, t("vzg.netDensityNone")],
      ];
    case "speed":
      return [
        ...SPEED_COLORS.map(
          (c, i) =>
            [
              c,
              2.2,
              i === 0
                ? `≤ ${SPEED_BINS[0]}`
                : i === SPEED_BINS.length - 1
                  ? `> ${SPEED_BINS[i - 1]}`
                  : `≤ ${SPEED_BINS[i]}`,
            ] as [string, number, string],
        ),
        [GREY, 1.4, t("vzg.mapSpeedUnknown")],
      ];
    case "electrified":
      return [
        ["#2166ac", 2.2, t("vzg.netElectrified")],
        ["#e08214", 2.2, t("vzg.netNotElectrified")],
        [GREY, 1.4, t("vzg.mapSpeedUnknown")],
      ];
    case "etcs":
      return [
        ["#1b9e77", 2.6, "ETCS Level 2"],
        ["#d95f02", 2.6, "ETCS Level 1"],
        [GREY, 1.4, t("vzg.netNone")],
      ];
    case "pzb":
      return [
        ["#7570b3", 2.2, "PZB"],
        ["#e7298a", 2.2, t("vzg.netNone")],
        [GREY, 1.4, t("vzg.mapSpeedUnknown")],
      ];
    case "tracks":
      return [
        ["#1f2328", 3.2, t("vzg.double")],
        ["#7a828c", 1.3, t("vzg.single")],
      ];
    case "gauge":
      return [
        ...Object.entries(GAUGES).map(([g, c]) => [c, 2.2, `${g} mm`] as [string, number, string]),
        ["#e7298a", 2.6, t("vzg.netOther")],
      ];
    case "operator":
      return [
        ...operators.value.map(([o, c]) => [c, 2.2, o] as [string, number, string]),
        [GREY, 1.6, t("vzg.netOther")],
      ];
  }
  return [];
});

// ---- projection (equirectangular at the network's mean latitude)
const W = 1100;
const PAD = 20;
const HEAD = 64;
const decoded = computed(() =>
  (network.value?.lines ?? []).map((l) => ({
    ...l,
    pieces: l.pieces.map((p) => ({ p, pts: decodePolyline(p.line) })),
  })),
);
/** borders: the country and its federal states, decoded */
const areas = computed(() =>
  (boundaries.value?.areas ?? []).map((a) => ({
    code: a.code,
    name: a.name,
    rings: a.rings.map((r) => decodePolyline(r)),
  })),
);
/** the whole country's region code ("AT", "SI"; ISO 3166-1) */
const CC = computed(() => country.value.toUpperCase());
const countryName = computed(
  () => COUNTRIES.find((c) => c.id === country.value)?.name[locale.value] ?? CC.value,
);
// region: the country or one of its federal states (?region=AT-7)
const region = computed(() => {
  const r = typeof route.query.region === "string" ? route.query.region : CC.value;
  return areas.value.some((a) => a.code === r) ? r : CC.value;
});
const regionName = computed(() => areas.value.find((a) => a.code === region.value)?.name ?? "");
const states = computed(() =>
  areas.value.filter((a) => a.code !== CC.value).sort((a, b) => a.name.localeCompare(b.name)),
);
const setRegion = (r: string) =>
  void router.replace({ query: { ...route.query, region: r === CC.value ? undefined : r } });
/** lines a bit thicker when zoomed into a state */
const widthScale = computed(() => (region.value === CC.value ? 1 : 1.5));

const view = computed(() => {
  // the frame: the region's outline (else all lines), with a small margin
  const outline = areas.value.find((a) => a.code === region.value)?.rings.flat();
  const all = outline?.length
    ? outline
    : decoded.value.flatMap((l) => l.pieces.flatMap((x) => x.pts));
  if (!all.length) return undefined;
  let [s, n, w, e] = [90, -90, 180, -180];
  for (const [la, lo] of all) {
    s = Math.min(s, la);
    n = Math.max(n, la);
    w = Math.min(w, lo);
    e = Math.max(e, lo);
  }
  const m = 0.04 * (n - s);
  [s, n, w, e] = [s - m, n + m, w - m * 1.5, e + m * 1.5];
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  // at least 1.2 : 1 (tall states such as Vorarlberg get wider, not taller)
  const minW = ((n - s) * 1.2) / kx;
  if (e - w < minW) {
    const c = (w + e) / 2;
    [w, e] = [c - minW / 2, c + minW / 2];
  }
  const mapW = W - 2 * PAD;
  const k = mapW / ((e - w) * kx);
  const mapH = Math.round((n - s) * k);
  return {
    mapH,
    x: (lo: number) => PAD + (lo - w) * kx * k,
    y: (la: number) => HEAD + (n - la) * k,
    kmPerPx: 111.32 / k,
  };
});
const FOOT = computed(() => 34 + Math.ceil(legend.value.length / 5) * 18);
const H = computed(() => (view.value ? HEAD + view.value.mapH + FOOT.value : 300));
const d = (pts: [number, number][]) => {
  const v = view.value!;
  return pts
    .map(([la, lo], i) => `${i ? "L" : "M"}${v.x(lo).toFixed(1)},${v.y(la).toFixed(1)}`)
    .join("");
};
/** per line its pieces, drawn thin first (grey/unknown below coloured) */
const drawn = computed(() =>
  decoded.value.map((l) => ({
    id: l.id,
    label: [l.ref, l.name].filter(Boolean).join(" ") || l.id,
    operator: l.operator,
    pieces: l.pieces
      .map((x) => {
        const st = style(x.p, l.operator);
        return { d: d(x.pts), ...st, width: st.width * widthScale.value, p: x.p };
      })
      .sort((a, b) => a.width - b.width),
  })),
);
const scale = computed(() => {
  const v = view.value;
  if (!v) return undefined;
  const target = (W / 8) * v.kmPerPx;
  const km = [5, 10, 20, 25, 50, 100].reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a,
  );
  return { km, px: km / v.kmPerPx };
});

const ATTR_LABEL: Record<Attr, string> = {
  speed: "vzg.netSpeed",
  density: "vzg.netDensity",
  electrified: "vzg.netElectrification",
  etcs: "ETCS",
  pzb: "PZB",
  tracks: "vzg.netTracks",
  gauge: "vzg.netGauge",
  operator: "vzg.netOperator",
};
const attrLabel = (a: Attr) =>
  ATTR_LABEL[a].startsWith("vzg.") ? t(ATTR_LABEL[a] as never) : ATTR_LABEL[a];
// "Infrastrukturnetzkarte · Tirol · Geschwindigkeit · zugx"
usePageTitle(() => [
  t("vzg.netTitle"),
  region.value === CC.value ? countryName.value : regionName.value,
  attrLabel(attr.value),
]);
const title = computed(
  () =>
    `${t("vzg.netTitle")}${region.value === CC.value ? "" : ` ${regionName.value}`} – ${attrLabel(attr.value)}`,
);

function tip(l: { label: string; operator?: string }, p: NetPiece): TipContent {
  return {
    title: l.label,
    lines: [
      l.operator,
      p.v !== undefined && t("vzg.tipSpeedHere", { v: p.v }),
      p.e !== undefined && (p.e ? t("vzg.netElectrified") : t("vzg.netNotElectrified")),
      !!p.etcs && `ETCS Level ${p.etcs}`,
      p.tr === 2 ? t("vzg.double") : t("vzg.single"),
      p.g && p.g !== "1435" && `${p.g} mm`,
    ],
  };
}
function go(id: string, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  void router.push(`/vzg/${id}/map`);
}

const svgEl = shallowRef<SVGSVGElement>();
function exportSvg() {
  if (!svgEl.value) return;
  const svg = svgEl.value.cloneNode(true) as SVGSVGElement;
  for (const a of ["class", "role", "aria-label"]) svg.removeAttribute(a);
  for (const el of svg.querySelectorAll("a")) el.removeAttribute("href");
  for (const el of svg.querySelectorAll("[aria-description],[aria-label],[data-tip-label]")) {
    el.removeAttribute("aria-description");
    el.removeAttribute("aria-label");
    el.removeAttribute("data-tip-label");
  }
  const meta = document.createElementNS("http://www.w3.org/2000/svg", "title");
  meta.textContent = title.value;
  svg.prepend(meta);
  download(
    `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`,
    `zugx_Infrastrukturnetzkarte_${(region.value === CC.value ? (COUNTRIES.find((c) => c.id === country.value)?.name.de ?? CC.value) : regionName.value).replace(/[^\p{L}\p{N}]+/gu, "_")}_${attr.value}.svg`,
  );
}
const SANS = "Liberation Sans, Arial, Nimbus Sans L, Helvetica, sans-serif";
const url = computed(() => {
  const q = new URLSearchParams();
  if (attr.value !== "speed") q.set("attr", attr.value);
  if (region.value !== CC.value) q.set("region", region.value);
  return `${location.origin}/vzg/netz${q.size ? `?${q}` : ""}`;
});
</script>

<template>
  <section class="vzg-map">
    <div class="no-print mb-2 flex flex-wrap items-center gap-2">
      <h1 class="m-0 text-xl">{{ $t("vzg.netTitle") }}</h1>
      <select
        class="input text-sm"
        :value="region"
        :aria-label="$t('vzg.netRegion')"
        @change="setRegion(($event.target as HTMLSelectElement).value)"
      >
        <option :value="CC">{{ countryName }}</option>
        <option v-for="a in states" :key="a.code" :value="a.code">{{ a.name }}</option>
      </select>
      <span class="ml-auto flex flex-wrap gap-1 text-xs">
        <button
          v-for="a in ATTRS"
          :key="a"
          class="btn"
          :class="attr === a && 'btn-on'"
          :aria-pressed="attr === a"
          @click="setAttr(a)"
        >
          {{ attrLabel(a) }}
        </button>
        <button class="btn" @click="exportSvg">⤓ SVG</button>
      </span>
    </div>
    <div v-if="view" class="map-card overflow-x-auto">
      <svg
        ref="svgEl"
        xmlns="http://www.w3.org/2000/svg"
        :viewBox="`0 0 ${W} ${H}`"
        :width="W"
        :height="H"
        :font-family="SANS"
        role="img"
        :aria-label="title"
        class="block h-auto max-w-full"
      >
        <rect :width="W" :height="H" fill="#ffffff" />
        <text :x="PAD" y="30" font-size="20" font-weight="700" fill="#1f2328">{{ title }}</text>
        <text :x="PAD" y="50" font-size="11" fill="#5b636c">
          {{ $t("vzg.netSubtitle", { n: drawn.length })
          }}{{
            attr === "density"
              ? ` · ${$t("vzg.netDensitySubtitle", { day: density?.day ?? "" })}`
              : ""
          }}
        </text>
        <!-- land and borders (OSM): Austria filled, federal states dashed -->
        <defs>
          <clipPath id="net-clip">
            <rect :x="PAD" :y="HEAD" :width="W - 2 * PAD" :height="view.mapH" />
          </clipPath>
        </defs>
        <g clip-path="url(#net-clip)">
          <path
            v-for="a in areas.filter((x) => x.code === 'AT')"
            :key="a.code"
            :d="a.rings.map((r) => `${d(r)}Z`).join('')"
            :fill="region === 'AT' ? '#f4f3ee' : '#fafaf7'"
            stroke="none"
          />
          <path
            v-for="a in areas.filter((x) => x.code === region && region !== 'AT')"
            :key="`r${a.code}`"
            :d="a.rings.map((r) => `${d(r)}Z`).join('')"
            fill="#f1efe7"
            stroke="none"
          />
          <path
            v-for="a in areas.filter((x) => x.code !== 'AT')"
            :key="a.code"
            :d="a.rings.map((r) => `${d(r)}Z`).join('')"
            fill="none"
            stroke="#a7adb4"
            stroke-width="0.8"
            stroke-dasharray="4 3"
          />
          <path
            v-for="a in areas.filter((x) => x.code === 'AT')"
            :key="`b${a.code}`"
            :d="a.rings.map((r) => `${d(r)}Z`).join('')"
            fill="none"
            stroke="#6b7280"
            stroke-width="1.4"
          />
        </g>
        <g fill="none" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#net-clip)">
          <a
            v-for="l in drawn"
            :key="l.id"
            :href="`/vzg/${l.id}/map`"
            class="net-line"
            @click="go(l.id, $event)"
          >
            <!-- speed: a dark edge, the pale middle classes would vanish on white -->
            <template v-if="attr === 'speed'">
              <path
                v-for="(x, i) in l.pieces"
                :key="`c${i}`"
                :d="x.d"
                stroke="#3a3f45"
                :stroke-width="x.width + 1.6"
              />
            </template>
            <path
              v-for="(x, i) in l.pieces"
              :key="i"
              v-tip="tip(l, x.p)"
              data-tip-at="pointer"
              :d="x.d"
              :stroke="x.color"
              :stroke-width="x.width"
            />
          </a>
        </g>
        <!-- trains per day (density mode), busiest on top; casing for the pale classes -->
        <g v-if="attr === 'density'" fill="none" stroke-linecap="round" clip-path="url(#net-clip)">
          <path
            v-for="(x, i) in densitySegments"
            :key="`dc${i}`"
            :d="x.d"
            stroke="#5b636c"
            :stroke-width="x.width + 1.2"
          />
          <a
            v-for="(x, i) in densitySegments"
            :key="`d${i}`"
            :href="`/vzg/${x.id}/map`"
            class="net-line"
            @click="go(x.id, $event)"
          >
            <path
              v-tip="{
                title: x.label,
                lines: [$t('vzg.netDensityTip', { n: x.n, day: density?.day ?? '' })],
              }"
              data-tip-at="pointer"
              :d="x.d"
              :stroke="x.color"
              :stroke-width="x.width"
            />
          </a>
        </g>
        <!-- scale bar -->
        <g
          v-if="scale"
          :transform="`translate(${PAD + 6} ${HEAD + view.mapH - 10})`"
          font-size="10"
          fill="#1f2328"
        >
          <rect :width="scale.px" height="5" fill="#ffffff" stroke="#1f2328" stroke-width="1" />
          <rect :width="scale.px / 2" height="5" fill="#1f2328" />
          <text y="-4">0</text>
          <text :x="scale.px" y="-4" text-anchor="middle">{{ scale.km }} km</text>
        </g>
        <!-- legend -->
        <g :transform="`translate(${PAD} ${HEAD + view.mapH + 22})`" font-size="11" fill="#1f2328">
          <g
            v-for="([c, w, label], i) in legend"
            :key="i"
            :transform="`translate(${(i % 5) * 210} ${Math.floor(i / 5) * 18})`"
          >
            <line x1="0" x2="26" y1="-4" y2="-4" :stroke="c" :stroke-width="w + 1" />
            <text x="32">{{ label }}</text>
          </g>
        </g>
        <text :x="PAD" :y="H - 10" font-size="9.5" fill="#5b636c">
          {{ $t("vzg.mapSources", { date: index?.osmDate ?? index?.created ?? "" }) }} ·
          {{ $t("vzg.exportMadeWith", { url }) }}
        </text>
      </svg>
    </div>
  </section>
</template>

<style>
.vzg-map .net-line {
  cursor: pointer;
}
.vzg-map .net-line:hover path {
  stroke-width: 4;
}
</style>
