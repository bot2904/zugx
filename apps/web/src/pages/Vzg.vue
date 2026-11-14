<script setup lang="ts">
// VzG-Grafik: permitted speeds along one line (Streckennummer per VzG/Streckenlisten) and one
// Regelgleis, modelled on ÖBB's VzG pages — vertical km axis in the direction of travel, columns
// km · operating points/signals · km of the speed changes · speed diagram · curve radii · km.
// Data: packages/vzg/data (from OpenStreetMap, ODbL).
import type { VzgIndex, VzgLine, VzgPoint, VzgTrack } from "@zugx/vzg";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import VzgIndexView from "../components/VzgIndex.vue";
import VzgAbbr from "../components/VzgAbbr.vue";

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
const pointTitle = (p: VzgPoint) =>
  [p.label, p.kind === "signal" ? p.signal : p.kind, `km ${p.km.toFixed(3)}`]
    .filter(Boolean)
    .join(" · ");

const curves = computed(() =>
  (track.value?.curves ?? []).filter((c) => c[1] >= domain.value.lo && c[0] <= domain.value.hi),
);
const curveLabels = computed(() => new Set(place(curves.value, (c) => y((c[0] + c[1]) / 2), 11)));
const curveOpacity = (r: number) => Math.max(0.15, Math.min(0.9, 300 / r));

const entry = computed(() => index.value?.lines.find((l) => l.ref === data.value?.ref));
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
        <option v-for="l in index.lines" :key="l.ref" :value="l.ref.replace(' ', '-')">
          {{ l.ref }}{{ l.name ? ` · ${l.name}` : "" }}
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
          :title="$t('vzg.trackTip', { n: t.track })"
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
        <label class="ml-2 flex items-center gap-1" :title="$t('vzg.allSignalsTip')">
          <input
            type="checkbox"
            :checked="allSignals"
            @change="
              setQuery({ all: ($event.target as HTMLInputElement).checked ? '1' : undefined })
            "
          />
          {{ $t("vzg.allSignals") }}
        </label>
      </span>
    </div>
    <p v-if="missing" class="muted">{{ $t("vzg.noData") }}</p>
    <template v-if="data && track">
      <p class="muted my-1 text-xs">
        <span class="mono">{{ data.ref }}</span>
        {{ data.name }}
        <template v-if="data.from || data.to">
          · {{ [data.from, data.to].filter(Boolean).join(" – ") }}</template
        >
        · km {{ track.kmFrom.toFixed(1) }}–{{ track.kmTo.toFixed(1) }} ·
        {{ track.length.toFixed(1) }} km · <span class="text-[var(--fg)]">━</span>
        {{ $t("vzg.travel") }}
        <span v-if="oppositePath">· ─·─ {{ $t("vzg.opposite") }}</span>
        · {{ $t("vzg.osm", { date: index?.created ?? "" }) }}
      </p>
      <div class="overflow-x-auto">
        <svg
          :viewBox="`0 0 ${W} ${H}`"
          :width="W"
          :height="H"
          class="vzg block font-[inherit]"
          role="img"
          :aria-label="`${$t('vzg.title')} ${data.ref} ${$t('vzg.track')} ${track.track}`"
        >
          <!-- column headers -->
          <g class="hdr" font-size="10">
            <text :x="COL.km" y="14" text-anchor="end">km</text>
            <text :x="COL.label" y="14">{{ $t("vzg.stations") }} / {{ $t("vzg.signals") }}</text>
            <text :x="COL.change" y="14" text-anchor="end">{{ $t("vzg.speedChange") }}</text>
            <text :x="(COL.d0 + COL.d1) / 2" y="14" text-anchor="middle">
              {{ $t("vzg.speed") }}
            </text>
            <text :x="COL.curve + 2" y="14">
              <title>{{ $t("vzg.curvesTip") }}</title>{{ $t("vzg.curves") }}
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
            <g v-for="(p, i) in visiblePoints" :key="i">
              <title>{{ pointTitle(p) }}</title>
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
          <!-- curves -->
          <g font-size="9" class="mono">
            <g v-for="(c, i) in curves" :key="`r${i}`">
              <title>R {{ c[2] }} m · km {{ fmt(c[0]) }}–{{ fmt(c[1]) }}</title>
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
      <p v-if="entry && entry.speedCoverage < 0.95" class="muted text-xs">
        {{ Math.round(entry.speedCoverage * 100) }} % maxspeed
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
.vzg .curve {
  fill: var(--link);
}
</style>
