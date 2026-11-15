<script setup lang="ts">
// VzG-Grafik: permitted speeds along one line (Streckennummer per VzG/Streckenlisten) and one
// Regelgleis, modelled on ÖBB's VzG pages — vertical km axis in the direction of travel, columns
// km · operating points/signals · km of the speed changes · speed diagram · curve radii · km.
// Data: packages/vzg/data (from OpenStreetMap, ODbL).
import type { VzgIndex, VzgLine, VzgPoint, VzgTrack } from "@zugx/vzg";
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import VzgIndexView from "../components/VzgIndex.vue";
import VzgAbbr from "../components/VzgAbbr.vue";
import { useI18n } from "../i18n/index.ts";
import { itemWikidata } from "../lib/wikidata.ts";
import { download, standaloneSvg } from "../lib/svg-export.ts";
import type { TipContent } from "../lib/tip.ts";

const files = import.meta.glob<{ default: VzgLine }>("../../../../packages/vzg/data/*.toml");
const indexFile = Object.entries(files).find(([p]) => p.endsWith("/index.toml"))?.[1] as
  | (() => Promise<{ default: VzgIndex }>)
  | undefined;

const route = useRoute();
const router = useRouter();
const index = shallowRef<VzgIndex>();
const data = shallowRef<VzgLine>();
const missing = ref(false);

const slug = computed(() => (route.params.line ? String(route.params.line) : undefined));

onMounted(async () => {
  if (indexFile) index.value = (await indexFile()).default;
});

watch(
  slug,
  async (s) => {
    data.value = undefined;
    missing.value = false;
    if (!s) return;
    const loader = Object.entries(files).find(([p]) => p.endsWith(`/${s}.toml`))?.[1];
    if (!loader) return void (missing.value = true);
    data.value = (await loader()).default;
  },
  { immediate: true },
);

function setQuery(patch: Record<string, string | number | undefined>) {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch }))
    if (v !== undefined) q[k] = String(v);
  void router.replace({ query: q });
}

// ---- selection: track (?t=), direction (?rev=1), scale (?z= px per km), all signals (?all=1)
const track = computed<VzgTrack | undefined>(() => {
  const ts = data.value?.tracks ?? [];
  return ts.find((t) => t.track === route.query.t) ?? ts[0];
});
/** km increase in the direction of travel: Regelgleis 1 → increasing, 2 → decreasing */
const increasing = computed(() => (track.value?.track === "2") === (route.query.rev === "1"));
const ZOOMS = [15, 40, 100, 250];
const z = computed(() => {
  const v = Number(route.query.z);
  return ZOOMS.includes(v) ? v : 40;
});
const allSignals = computed(() => route.query.all === "1");

// ---- layout
const W = 900;
const TOP = 46;
const BOTTOM = 24;
const COL = { km: 44, sym: 62, label: 72, change: 366, d0: 384, d1: 770, curve: 780, km2: 896 };

const domain = computed(() => {
  const t = track.value;
  if (!t) return { lo: 0, hi: 1 };
  // points just outside the path's km range (e.g. the first station) still belong on the sheet
  const near = t.points.filter((p) => p.km > t.kmFrom - 1 && p.km < t.kmTo + 1).map((p) => p.km);
  return { lo: Math.min(t.kmFrom, ...near), hi: Math.max(t.kmTo, ...near) };
});
const H = computed(() => TOP + BOTTOM + (domain.value.hi - domain.value.lo) * z.value);
const y = (km: number) =>
  TOP + (increasing.value ? km - domain.value.lo : domain.value.hi - km) * z.value;

const vmax = computed(() => {
  const vs = (track.value?.speeds ?? []).flatMap((s) => [s[2] ?? 0, s[3] ?? 0]);
  return Math.max(100, Math.ceil(Math.max(0, ...vs) / 20) * 20);
});
const vx = (v: number) => COL.d0 + (v / vmax.value) * (COL.d1 - COL.d0);
const vGrid = computed(() => Array.from({ length: vmax.value / 20 + 1 }, (_, i) => i * 20));

const kmTicks = computed(() => {
  const { lo, hi } = domain.value;
  const step = z.value >= 100 ? 0.1 : z.value >= 15 ? 1 : 5;
  const labelEvery = z.value >= 250 ? 0.5 : z.value >= 40 ? 1 : 5;
  const out: { km: number; label: boolean }[] = [];
  for (let k = Math.ceil(lo / step) * step; k <= hi + 1e-9; k += step) {
    const r = Math.round(k * 10) / 10;
    out.push({ km: r, label: Math.abs(r / labelEvery - Math.round(r / labelEvery)) < 1e-6 });
  }
  return out;
});

// ---- speeds in the direction of travel (solid) and the opposite direction (dash-dot)
type Sec = { a: number; b: number; v: number | null; o: number | null };
const sections = computed<Sec[]>(() =>
  (track.value?.speeds ?? []).map(([a, b, up, down]) => ({
    a,
    b,
    v: increasing.value ? up : down,
    o: increasing.value ? down : up,
  })),
);
/** step line through the sections: runs of [x, y] points (gaps where the speed is unknown) */
function stepRuns(pick: (s: Sec) => number | null): [number, number][][] {
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  let lastB = Number.NaN;
  for (const s of sections.value) {
    const v = pick(s);
    if (v === null || Math.abs(lastB - s.a) > 1e-6) {
      if (run.length) runs.push(run);
      run = [];
    }
    if (v === null) continue;
    run.push([vx(v), y(s.a)], [vx(v), y(s.b)]);
    lastB = s.b;
  }
  if (run.length) runs.push(run);
  return runs;
}
const line = (run: [number, number][]) => `M${run.map(([px, py]) => `${px},${py}`).join("L")}`;
const travelRuns = computed(() => stepRuns((s) => s.v));
const travelPath = computed(() => travelRuns.value.map(line).join(""));
const oppositePath = computed(() =>
  sections.value.some((s) => s.o !== s.v)
    ? stepRuns((s) => s.o)
        .map(line)
        .join("")
    : "",
);
/** area under the speed line: one rectangle per section */
const fillRects = computed(() =>
  sections.value
    .filter((s) => s.v !== null)
    .map((s) => ({
      y: Math.min(y(s.a), y(s.b)),
      h: Math.abs(y(s.b) - y(s.a)),
      w: vx(s.v!) - COL.d0,
    })),
);

/** greedy label placement: keep a label only if it does not overlap one already placed */
function place<T>(items: T[], yOf: (t: T) => number, gap: number): T[] {
  const taken: number[] = [];
  return items.filter((it) => {
    const yy = yOf(it);
    if (taken.some((t) => Math.abs(t - yy) < gap)) return false;
    taken.push(yy);
    return true;
  });
}

/** speed changes in the direction of travel: km (column 6) and the new speed next to the line */
const changes = computed(() => {
  const out: { km: number; v: number | null }[] = [];
  const secs = increasing.value ? sections.value : [...sections.value].reverse();
  let prev: number | null | undefined;
  for (const s of secs) {
    if (s.v !== prev) out.push({ km: increasing.value ? s.a : s.b, v: s.v });
    prev = s.v;
  }
  return place(out, (c) => y(c.km), 11);
});

// ---- operating points and signals
const MINOR = new Set([
  "shunting",
  "minor",
  "electricity",
  "crossing",
  "crossing_distant",
  "train_protection",
]);
/** named stop positions without a station/halt node of that name stand for a halt */
const stopHalts = computed(() => {
  const ps = track.value?.points ?? [];
  const named = new Set(
    ps.filter((p) => p.kind === "station" || p.kind === "halt").map((p) => p.label),
  );
  const seen = new Set<string>();
  return new Set(
    ps.filter((p) => {
      if (p.kind !== "stop" || !p.label || named.has(p.label) || seen.has(p.label)) return false;
      seen.add(p.label);
      return true;
    }),
  );
});
const isMain = (p: VzgPoint) => p.kind === "station" || p.kind === "halt" || stopHalts.value.has(p);
const visiblePoints = computed(() => {
  const t = track.value;
  if (!t) return [];
  return t.points.filter((p) => {
    if (p.km < domain.value.lo || p.km > domain.value.hi) return false;
    if (p.kind === "stop") return stopHalts.value.has(p) || allSignals.value;
    if (p.kind === "signal")
      return allSignals.value || (p.signal ?? "").split(",").some((s) => s && !MINOR.has(s));
    return true;
  });
});
/** labelled points: stations and halts first, then signals where there is room */
const labelled = computed(() => {
  const ps = visiblePoints.value.filter((p) => p.label);
  const ordered = [...ps.filter(isMain), ...ps.filter((p) => !isMain(p))];
  return new Set(place(ordered, (p) => y(p.km), 11));
});
const stationLines = computed(() => visiblePoints.value.filter(isMain));

function signalColor(p: VzgPoint) {
  const s = p.signal ?? "";
  if (s.includes("speed_limit")) return "var(--warn)";
  if (/(^|,)main/.test(s)) return "var(--bad)";
  if (s.includes("distant")) return "var(--good)";
  return "var(--muted)";
}
// ---- tooltips
const { t, tm, locale } = useI18n();
const kmText = (km: number, d = 3) =>
  km.toLocaleString(locale.value, { minimumFractionDigits: d, maximumFractionDigits: d });
const sigName = (s: string) => (tm("vzg.sig") as Record<string, string>)[s] ?? s;
const kindName = (k: string) => (tm("vzg.kind") as Record<string, string>)[k] ?? k;
/** permitted speed at a km, in the direction of travel and the opposite one */
function speedAt(km: number) {
  const s = sections.value.find((x) => km >= Math.min(x.a, x.b) && km <= Math.max(x.a, x.b));
  return s ? { v: s.v, o: s.o } : undefined;
}
function speedLine(km: number): string {
  const s = speedAt(km);
  if (!s || s.v === null) return t("vzg.tipNoSpeed");
  return s.o !== null && s.o !== s.v
    ? t("vzg.tipSpeedBoth", { v: s.v, o: s.o })
    : t("vzg.tipSpeedHere", { v: s.v });
}
function pointTip(p: VzgPoint): TipContent {
  const types =
    p.kind === "signal"
      ? (p.signal ?? "").split(",").filter(Boolean).map(sigName).join(" + ") || kindName("signal")
      : kindName(stopHalts.value.has(p) ? "halt" : p.kind);
  return {
    title: p.label ? (p.kind === "signal" ? `${types} ${p.label}` : p.label) : types,
    lines: [
      p.label && p.kind !== "signal" && types,
      t(p.measured ? "vzg.tipKmMeasured" : "vzg.tipKmInterpolated", { km: kmText(p.km) }),
      speedLine(p.km),
    ],
  };
}
function sectionTip(s: Sec): TipContent {
  const [a, b] = increasing.value ? [s.a, s.b] : [s.b, s.a];
  return {
    title: s.v === null ? t("vzg.tipNoSpeed") : `${s.v} km/h`,
    lines: [
      t("vzg.tipTravel"),
      t("vzg.tipSection", { from: kmText(a), to: kmText(b), len: kmText(Math.abs(b - a), 2) }),
      s.o !== null && s.o !== s.v && t("vzg.tipOpposite", { o: s.o }),
    ],
  };
}
function curveTip(c: [number, number, number]): TipContent {
  return {
    title: t("vzg.tipCurve", { r: c[2] }),
    lines: [
      t("vzg.tipSection", {
        from: kmText(c[0]),
        to: kmText(c[1]),
        len: kmText(Math.abs(c[1] - c[0]), 2),
      }),
      speedLine((c[0] + c[1]) / 2),
      t("vzg.tipCurveEst"),
    ],
  };
}

const curves = computed(() =>
  (track.value?.curves ?? []).filter((c) => c[1] >= domain.value.lo && c[0] <= domain.value.hi),
);
const curveLabels = computed(() => new Set(place(curves.value, (c) => y((c[0] + c[1]) / 2), 11)));
const curveOpacity = (r: number) => Math.max(0.15, Math.min(0.9, 300 / r));

// ---- SVG export (e.g. for Wikimedia Commons): caption, data sources, link back to this view
const chart = ref<SVGSVGElement>();
function exportSvg() {
  const l = data.value;
  const tr = track.value;
  if (!chart.value || !l || !tr) return;
  // stations in the direction of travel: first and last
  const st = tr.points.filter((p) => p.kind === "station" && p.label).sort((a, b) => a.km - b.km);
  const ends = increasing.value ? [st[0], st.at(-1)] : [st.at(-1), st[0]];
  const dir = ends.every(Boolean) ? `${ends[0]!.label} → ${ends[1]!.label}` : "";
  const line = [l.ref, l.name].filter(Boolean).join(" ");
  const caption = `${t("vzg.title")} ${line} – ${t("vzg.track")} ${tr.track}${dir ? `: ${dir}` : ""}`;
  const subtitle = [
    l.operator,
    l.gauge && l.gauge !== "1435" ? `${l.gauge} mm` : "",
    `km ${kmText(Math.min(tr.kmFrom, tr.kmTo), 1)} – ${kmText(Math.max(tr.kmFrom, tr.kmTo), 1)}`,
    `${kmText(tr.length, 1)} km`,
  ]
    .filter(Boolean)
    .join(" · ");
  const url = `${location.origin}${route.fullPath}`;
  const svg = standaloneSvg(chart.value, {
    title: caption,
    description: t("vzg.exportDesc"),
    caption,
    subtitle,
    footer: [
      t("vzg.exportLegend"),
      t("vzg.exportData", { date: index.value?.created ?? "" }),
      t("vzg.exportMadeWith", { url }),
    ],
  });
  const file = `zugx_VzG_${(line || l.id).replace(/[^\p{L}\p{N}]+/gu, "_")}_${t("vzg.track")}_${tr.track}.svg`;
  download(svg, file);
}

// ---- connecting lines (build time: same station on other lines ≥ 5 km)
const connections = computed(() => {
  const d = domain.value;
  return (data.value?.connections ?? [])
    .filter((c) => c.km >= d.lo - 1 && c.km <= d.hi + 1)
    .sort((a, b) => (increasing.value ? a.km - b.km : b.km - a.km));
});
/** link to another line's chart at a km (same track number if it has it) */
const kmParam = (km: number) => String(Math.round(km * 10) / 10 || 0);
const lineLink = (o: { id: string; km: number }) => ({
  path: `/vzg/${o.id}`,
  query: { km: kmParam(o.km) },
});
/** OSM names sometimes repeat the number ("267 01 Pinzgauer Lokalbahn") */
const lineName = (o: { ref?: string; name?: string }) =>
  o.ref && o.name?.startsWith(o.ref) ? o.name.slice(o.ref.length).trim() : o.name;
const lineText = (o: { ref?: string; name?: string; id: string }) =>
  [o.ref, lineName(o)].filter(Boolean).join(" ") || o.id;
/** in the chart: markers at the junction stations whose label is shown */
const connectionMarks = computed(() =>
  connections.value.filter((c) =>
    [...labelled.value].some((p) => p.label === c.station || Math.abs(p.km - c.km) < 0.05),
  ),
);
function openLine(o: { id: string; km: number }, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  void router.push(lineLink(o));
}
// ?km=: scroll the chart to that km (links from other lines' junctions)
const scrolledFor = ref("");
watch(
  [data, track, () => route.query.km],
  async ([d, tr, km]) => {
    if (!d || !tr || typeof km !== "string" || scrolledFor.value === `${d.id}@${km}`) return;
    scrolledFor.value = `${d.id}@${km}`;
    await nextTick();
    const el = chart.value;
    if (!el) return;
    const top = el.getBoundingClientRect().top + scrollY + y(Number(km)) - innerHeight / 3;
    scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  },
  { flush: "post" },
);

const entry = computed(() => index.value?.lines.find((l) => l.id === data.value?.id));
const fmt = (km: number) => km.toFixed(3);
</script>

<template>
  <VzgIndexView v-if="!slug && index" :index="index" />
  <section v-else-if="slug">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="m-0 text-xl">
        <RouterLink to="/vzg" class="text-[var(--fg)]"
          ><VzgAbbr :text="$t('vzg.title')"
        /></RouterLink>
      </h1>
      <select
        v-if="index"
        class="input text-sm"
        :value="slug"
        :aria-label="$t('vzg.line')"
        @change="router.push({ path: `/vzg/${($event.target as HTMLSelectElement).value}` })"
      >
        <option v-for="l in index.lines" :key="l.id" :value="l.id">
          {{ [l.ref, l.name].filter(Boolean).join(" · ") }}
        </option>
      </select>
      <span v-if="data" class="flex flex-wrap items-center gap-1 text-xs">
        <span class="muted">{{ $t("vzg.track") }}</span>
        <button
          v-for="t in data.tracks"
          :key="t.track"
          class="btn"
          :class="track?.track === t.track && 'btn-on'"
          :aria-pressed="track?.track === t.track"
          v-tip="$t('vzg.trackTip', { n: t.track })"
          @click="setQuery({ t: t.track === data.tracks[0]?.track ? undefined : t.track })"
        >
          {{ t.track }}
        </button>
        <button
          class="btn"
          :aria-pressed="route.query.rev === '1'"
          @click="setQuery({ rev: route.query.rev === '1' ? undefined : '1' })"
        >
          ⇅ {{ $t("bf.swap") }}
        </button>
        <span class="muted ml-2">{{ $t("vzg.zoom") }}</span>
        <button
          v-for="v in ZOOMS"
          :key="v"
          class="btn"
          :class="z === v && 'btn-on'"
          :aria-pressed="z === v"
          @click="setQuery({ z: v === 40 ? undefined : v })"
        >
          {{ v }} px/km
        </button>
        <label class="ml-2 flex items-center gap-1" v-tip="$t('vzg.allSignalsTip')">
          <input
            type="checkbox"
            :checked="allSignals"
            @change="
              setQuery({ all: ($event.target as HTMLInputElement).checked ? '1' : undefined })
            "
          />
          {{ $t("vzg.allSignals") }}
        </label>
        <button class="btn ml-2" v-tip="$t('vzg.exportTip')" @click="exportSvg">⤓ SVG</button>
      </span>
    </div>
    <p v-if="missing" class="muted">{{ $t("vzg.noData") }}</p>
    <template v-if="data && track">
      <p class="muted my-1 text-xs">
        <span v-if="data.ref" class="mono">{{ data.ref }}</span>
        {{ data.name }}
        <template v-if="data.operator"> · {{ data.operator }}</template>
        <template v-if="data.gauge && data.gauge !== '1435'"> · {{ data.gauge }} mm</template>
        <template v-if="data.wikidata">
          ·
          <a
            :href="itemWikidata(data.wikidata)"
            target="_blank"
            rel="noopener"
            v-tip="$t('vzg.wikidataTip')"
            >Wikidata</a
          ></template
        >
        <template v-if="data.from || data.to">
          · {{ [data.from, data.to].filter(Boolean).join(" – ") }}</template
        >
        · km {{ track.kmFrom.toFixed(1) }}–{{ track.kmTo.toFixed(1) }} ·
        {{ track.length.toFixed(1) }} km · <span class="text-[var(--fg)]">━</span>
        {{ $t("vzg.travel") }}
        <span v-if="oppositePath">· ─·─ {{ $t("vzg.opposite") }}</span>
        · {{ $t("vzg.asOf", { date: index?.created ?? "" }) }}
      </p>
      <p class="muted my-1 text-xs">
        <span class="inline-block h-2 w-1.5 bg-[var(--link)] align-middle" aria-hidden="true" />
        {{ $t("vzg.curvesTip") }}
      </p>
      <div class="overflow-x-auto">
        <svg
          :viewBox="`0 0 ${W} ${H}`"
          :width="W"
          :height="H"
          ref="chart"
          class="vzg block font-[inherit]"
          role="img"
          :aria-label="`${$t('vzg.title')} ${data.ref ?? data.name} ${$t('vzg.track')} ${track.track}`"
        >
          <!-- column headers -->
          <g class="hdr" font-size="10">
            <text :x="COL.km" y="14" text-anchor="end">km</text>
            <text :x="COL.label" y="14">{{ $t("vzg.stations") }} / {{ $t("vzg.signals") }}</text>
            <text :x="COL.change" y="14" text-anchor="end">{{ $t("vzg.speedChange") }}</text>
            <text :x="(COL.d0 + COL.d1) / 2" y="14" text-anchor="middle">
              {{ $t("vzg.speed") }}
            </text>
            <text :x="COL.curve + 2" y="14" v-tip="$t('vzg.curvesTip')">
              {{ $t("vzg.curves") }}
            </text>
            <text v-for="v in vGrid" :key="v" :x="vx(v)" y="34" text-anchor="middle" class="mono">
              {{ v }}
            </text>
          </g>
          <line :x1="0" :x2="W" :y1="TOP - 6" :y2="TOP - 6" class="rule" />
          <!-- speed grid -->
          <line
            v-for="v in vGrid"
            :key="`g${v}`"
            :x1="vx(v)"
            :x2="vx(v)"
            :y1="TOP - 6"
            :y2="H - BOTTOM"
            class="grid"
            :class="v % 100 === 0 && 'grid-strong'"
          />
          <!-- km axis (left and right) -->
          <g font-size="10" class="mono">
            <template v-for="t in kmTicks" :key="t.km">
              <line
                :x1="COL.km + 4"
                :x2="COL.km + (t.label ? 12 : 8)"
                :y1="y(t.km)"
                :y2="y(t.km)"
                class="tick"
              />
              <line
                :x1="COL.km2 - 40"
                :x2="COL.km2 - 40 - (t.label ? 8 : 4)"
                :y1="y(t.km)"
                :y2="y(t.km)"
                class="tick"
              />
              <template v-if="t.label">
                <text :x="COL.km" :y="y(t.km) + 3.5" text-anchor="end">
                  {{ t.km.toFixed(z >= 250 ? 1 : 0) }}
                </text>
                <text :x="COL.km2" :y="y(t.km) + 3.5" text-anchor="end">
                  {{ t.km.toFixed(z >= 250 ? 1 : 0) }}
                </text>
              </template>
            </template>
          </g>
          <!-- stations: faint line across the diagram -->
          <line
            v-for="p in stationLines"
            :key="`sl${p.km}${p.label}`"
            :x1="COL.sym"
            :x2="COL.d1"
            :y1="y(p.km)"
            :y2="y(p.km)"
            class="station-line"
          />
          <!-- speed diagram -->
          <rect
            v-for="(r, i) in fillRects"
            :key="`f${i}`"
            :x="COL.d0"
            :y="r.y"
            :width="r.w"
            :height="r.h"
            class="fill"
          />
          <path v-if="oppositePath" :d="oppositePath" class="opposite" />
          <!-- hover targets per speed section (whole diagram width) -->
          <rect
            v-for="(s, i) in sections"
            :key="`h${i}`"
            v-tip="sectionTip(s)"
            :x="COL.d0"
            :y="Math.min(y(s.a), y(s.b))"
            :width="COL.d1 - COL.d0"
            :height="Math.max(2, Math.abs(y(s.b) - y(s.a)))"
            fill="transparent"
            class="hit"
          />
          <path :d="travelPath" class="travel" />
          <!-- speed changes -->
          <g font-size="10" class="mono">
            <template v-for="c in changes" :key="`c${c.km}`">
              <line :x1="COL.change + 4" :x2="COL.d0" :y1="y(c.km)" :y2="y(c.km)" class="tick" />
              <text :x="COL.change" :y="y(c.km) + 3.5" text-anchor="end">{{ fmt(c.km) }}</text>
              <text
                v-if="c.v !== null"
                :x="vx(c.v) + (c.v > vmax - 20 ? -4 : 4)"
                :y="y(c.km) + 11"
                :text-anchor="c.v > vmax - 20 ? 'end' : undefined"
                class="v"
              >
                {{ c.v }}
              </text>
            </template>
          </g>
          <!-- operating points and signals -->
          <g font-size="10">
            <g v-for="(p, i) in visiblePoints" :key="i" v-tip="pointTip(p)" class="hit">
              <!-- hover target: the whole row of symbol and label (a signal mark is 6 px) -->
              <rect
                :x="COL.sym - 8"
                :y="y(p.km) - 5"
                :width="(labelled.has(p) ? COL.change - 40 : COL.label) - COL.sym + 8"
                height="10"
                fill="transparent"
              />
              <rect
                v-if="p.kind === 'station'"
                :x="COL.sym - 4"
                :y="y(p.km) - 4"
                width="8"
                height="8"
                class="station"
              />
              <circle
                v-else-if="p.kind === 'halt' || stopHalts.has(p)"
                :cx="COL.sym"
                :cy="y(p.km)"
                r="3.5"
                class="halt"
              />
              <path
                v-else-if="p.kind === 'signal'"
                :d="`M${COL.sym - 6},${y(p.km)}h6`"
                :stroke="signalColor(p)"
                stroke-width="2"
              />
              <circle v-else :cx="COL.sym" :cy="y(p.km)" r="1.5" class="other" />
              <text
                v-if="labelled.has(p)"
                :x="COL.label"
                :y="y(p.km) + 3.5"
                :class="isMain(p) ? 'name' : 'sig mono'"
              >
                {{ p.label }}
              </text>
            </g>
          </g>
          <!-- connecting lines at junction stations: links to their charts -->
          <g font-size="9" class="conn">
            <a
              v-for="c in connectionMarks"
              :key="`c-${c.station}`"
              :href="`/vzg/${c.lines[0]!.id}?km=${kmParam(c.lines[0]!.km)}`"
              v-tip="{
                title: c.station,
                lines: c.lines.map((o) => `↗ ${lineText(o)}`),
              }"
              @click="openLine(c.lines[0]!, $event)"
            >
              <text :x="COL.change - 44" :y="y(c.km) + 3.5" text-anchor="end">
                ↗
                {{
                  c.lines
                    .slice(0, 2)
                    .map((o) => o.ref ?? lineName(o))
                    .join(" · ")
                }}{{ c.lines.length > 2 ? ` +${c.lines.length - 2}` : "" }}
              </text>
            </a>
          </g>
          <!-- curves -->
          <g font-size="9" class="mono">
            <g v-for="(c, i) in curves" :key="`r${i}`" v-tip="curveTip(c)" class="hit">
              <rect
                :x="COL.curve"
                :y="Math.min(y(c[0]), y(c[1]))"
                width="6"
                :height="Math.max(1, Math.abs(y(c[1]) - y(c[0])))"
                class="curve"
                :fill-opacity="curveOpacity(c[2])"
              />
              <text v-if="curveLabels.has(c)" :x="COL.curve + 10" :y="y((c[0] + c[1]) / 2) + 3">
                {{ c[2] }}
              </text>
            </g>
          </g>
        </svg>
      </div>
      <section v-if="connections.length" class="my-3">
        <h2 class="m-0 mb-1 text-base">{{ $t("vzg.connections") }}</h2>
        <ul class="m-0 list-none p-0 text-sm">
          <li v-for="c in connections" :key="c.station" class="py-0.5">
            <span class="mono muted mr-1">km {{ kmText(c.km, 1) }}</span>
            <span class="font-medium">{{ c.station }}</span>:
            <template v-for="(o, i) in c.lines" :key="o.id"
              ><template v-if="i"> · </template
              ><RouterLink :to="lineLink(o)"
                ><span v-if="o.ref" class="mono">{{ o.ref }}</span
                >{{ o.ref && lineName(o) ? " " : "" }}{{ lineName(o) }}</RouterLink
              ></template
            >
          </li>
        </ul>
      </section>
      <p v-if="entry && entry.speedCoverage < 0.95" class="muted text-xs">
        {{ $t("vzg.coverage", { p: Math.round(entry.speedCoverage * 100) }) }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.vzg text {
  fill: var(--fg);
}
.vzg .hdr text {
  fill: var(--muted);
}
.vzg .rule,
.vzg .tick {
  stroke: var(--muted);
  stroke-width: 1;
}
.vzg .grid {
  stroke: var(--line);
  stroke-width: 1;
}
.vzg .grid-strong {
  stroke: var(--muted);
  stroke-opacity: 0.5;
}
.vzg .station-line {
  stroke: var(--line);
  stroke-dasharray: 2 3;
}
.vzg .fill {
  fill: var(--accent);
  fill-opacity: 0.08;
}
.vzg .travel {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}
.vzg .opposite {
  fill: none;
  stroke: var(--fg);
  stroke-width: 1;
  stroke-dasharray: 8 3 2 3;
}
.vzg .v {
  fill: var(--accent);
  font-weight: 600;
}
.vzg .station {
  fill: var(--fg);
}
.vzg .halt {
  fill: var(--bg);
  stroke: var(--fg);
  stroke-width: 1.5;
}
.vzg .other {
  fill: var(--muted);
}
.vzg .name {
  font-weight: 600;
}
.vzg .sig {
  fill: var(--muted);
  font-size: 9px;
}
.vzg .conn text {
  fill: var(--link);
}
.vzg .conn a:hover text {
  text-decoration: underline;
}
.vzg .hit {
  cursor: help;
}
.vzg .curve {
  fill: var(--link);
}
</style>
