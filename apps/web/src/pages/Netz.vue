<script setup lang="ts">
// Read-only Netzgrafik: nodes (Knoten) + line sections with departure/arrival minutes at both ends.
import { computed, onMounted, ref, shallowRef } from "vue";
import { categoryColor } from "../lib/products.ts";

interface NetzNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** minutes where many trains meet, e.g. [0, 30] */
  knoten?: number[];
}
interface NetzStop {
  node: string;
  arr: number | null;
  dep: number | null;
}
interface NetzLine {
  id: string;
  cat: string;
  name: string;
  takt: number | null;
  trips: number;
  numbers?: string;
  stops: NetzStop[];
  symmetry?: number | null;
}
interface Netz {
  day: string;
  source: string;
  nodes: NetzNode[];
  lines: NetzLine[];
}

const files = import.meta.glob<{ default: Netz }>("../../../../packages/netz/data/netz.json");
const ngeUrl = Object.values(
  import.meta.glob("../../../../packages/netz/data/nge.json", {
    query: "?url",
    import: "default",
    eager: true,
  }),
)[0] as string | undefined;

const netz = shallowRef<Netz>();
const loading = ref(true);
const selLine = ref<string>();
const selNode = ref<string>();
const hiddenCats = ref(new Set<string>());
const minTakt = ref(0);

onMounted(async () => {
  const loader = Object.values(files)[0];
  if (loader) netz.value = (await loader()).default;
  loading.value = false;
});

// projection: equirectangular around Austria, fitted to the viewBox
const W = 1200;
const H = 640;
const PAD = 50;
const bounds = computed(() => {
  const ns = netz.value?.nodes ?? [];
  const lats = ns.map((n) => n.lat);
  const lons = ns.map((n) => n.lon);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
});
const k = computed(() => {
  const b = bounds.value;
  const cos = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
  return Math.min(
    (W - 2 * PAD) / ((b.maxLon - b.minLon) * cos || 1),
    (H - 2 * PAD) / (b.maxLat - b.minLat || 1),
  );
});
const pos = computed(() => {
  const b = bounds.value;
  const cos = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
  const m = new Map<string, { x: number; y: number }>();
  for (const n of netz.value?.nodes ?? []) {
    m.set(n.id, {
      x: PAD + (n.lon - b.minLon) * cos * k.value,
      y: H - PAD - (n.lat - b.minLat) * k.value,
    });
  }
  return m;
});

const visibleLines = computed(() =>
  (netz.value?.lines ?? []).filter(
    (l) =>
      !hiddenCats.value.has(l.cat) &&
      (!minTakt.value || (l.takt !== null && l.takt <= minTakt.value)),
  ),
);

interface Section {
  line: NetzLine;
  a: string;
  b: string;
  dep: number | null;
  arr: number | null;
  offset: number;
}

/** consecutive node pairs per line, with parallel offsets for lines sharing an edge */
const sections = computed<Section[]>(() => {
  const out: Section[] = [];
  const count = new Map<string, number>();
  for (const l of visibleLines.value) {
    for (let i = 1; i < l.stops.length; i++) {
      const s = l.stops[i - 1]!;
      const t = l.stops[i]!;
      if (!pos.value.has(s.node) || !pos.value.has(t.node)) continue;
      const key = [s.node, t.node].sort().join("|");
      const n = count.get(key) ?? 0;
      count.set(key, n + 1);
      out.push({ line: l, a: s.node, b: t.node, dep: s.dep, arr: t.arr, offset: n });
    }
  }
  return out;
});

function geom(s: Section) {
  const p = pos.value.get(s.a)!;
  const q = pos.value.get(s.b)!;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const o = (s.offset % 2 ? 1 : -1) * Math.ceil(s.offset / 2) * 5;
  const ax = p.x + nx * o;
  const ay = p.y + ny * o;
  const bx = q.x + nx * o;
  const by = q.y + ny * o;
  const lab = (f: number) => ({ x: ax + dx * f + nx * 7, y: ay + dy * f + ny * 7 });
  return {
    ax,
    ay,
    bx,
    by,
    depAt: lab(Math.min(0.22, 22 / len)),
    arrAt: lab(1 - Math.min(0.22, 22 / len)),
  };
}

const mm = (m: number | null) => (m === null ? "" : String(Math.round(m) % 60).padStart(2, "0"));
const cats = computed(() => [...new Set(netz.value?.lines.map((l) => l.cat) ?? [])]);
function toggleCat(c: string) {
  const s = new Set(hiddenCats.value);
  if (s.has(c)) s.delete(c);
  else s.add(c);
  hiddenCats.value = s;
}
const node = computed(() => netz.value?.nodes.find((n) => n.id === selNode.value));
const nodeLines = computed(() =>
  visibleLines.value.filter((l) => l.stops.some((s) => s.node === selNode.value)),
);
const line = computed(() => netz.value?.lines.find((l) => l.id === selLine.value));
const nodeName = (id: string) => netz.value?.nodes.find((n) => n.id === id)?.name ?? id;
</script>

<template>
  <section>
    <div class="flex flex-wrap items-baseline gap-2">
      <h1 class="m-0 text-xl">{{ $t("netz.title") }}</h1>
      <span class="muted text-sm">{{ $t("netz.subtitle") }}</span>
      <a
        v-if="ngeUrl"
        :href="ngeUrl"
        download="zugx-netzgrafik-nge.json"
        class="btn ml-auto text-xs"
        >⤓ {{ $t("netz.export") }}</a
      >
    </div>
    <p v-if="!loading && !netz" class="muted">{{ $t("netz.noData") }}</p>
    <template v-if="netz">
      <div class="my-2 flex flex-wrap items-center gap-1 text-xs">
        <button
          v-for="c in cats"
          :key="c"
          class="btn py-0.5 text-xs"
          :class="hiddenCats.has(c) && 'muted line-through'"
          :style="{ borderColor: categoryColor(c) }"
          @click="toggleCat(c)"
        >
          {{ c }}
        </button>
        <label class="ml-2 flex items-center gap-1">
          {{ $t("netz.takt") }} ≤
          <select v-model.number="minTakt" class="input text-xs">
            <option :value="0">*</option>
            <option :value="30">30′</option>
            <option :value="60">60′</option>
            <option :value="120">120′</option>
          </select>
        </label>
        <span class="muted ml-auto">{{ netz.day }} · {{ netz.source }}</span>
      </div>
      <div class="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div class="card overflow-x-auto p-1">
          <svg
            :viewBox="`0 0 ${W} ${H}`"
            class="block w-full min-w-[900px]"
            role="img"
            :aria-label="$t('netz.title')"
          >
            <g
              v-for="(s, i) in sections"
              :key="i"
              class="cursor-pointer"
              :opacity="selLine && selLine !== s.line.id ? 0.15 : 1"
              @click="selLine = selLine === s.line.id ? undefined : s.line.id"
            >
              <line
                :x1="geom(s).ax"
                :y1="geom(s).ay"
                :x2="geom(s).bx"
                :y2="geom(s).by"
                :stroke="categoryColor(s.line.cat)"
                :stroke-width="
                  s.line.takt && s.line.takt <= 30 ? 3 : s.line.takt && s.line.takt <= 60 ? 2 : 1.2
                "
                :stroke-dasharray="s.line.takt && s.line.takt > 60 ? '5 3' : undefined"
              />
              <text
                :x="geom(s).depAt.x"
                :y="geom(s).depAt.y"
                font-size="9"
                text-anchor="middle"
                class="mono"
                fill="var(--fg)"
              >
                {{ mm(s.dep) }}
              </text>
              <text
                :x="geom(s).arrAt.x"
                :y="geom(s).arrAt.y"
                font-size="9"
                text-anchor="middle"
                class="mono"
                fill="var(--muted)"
              >
                {{ mm(s.arr) }}
              </text>
            </g>
            <g
              v-for="n in netz.nodes"
              :key="n.id"
              class="cursor-pointer"
              @click="selNode = selNode === n.id ? undefined : n.id"
            >
              <rect
                :x="pos.get(n.id)!.x - 7"
                :y="pos.get(n.id)!.y - 7"
                width="14"
                height="14"
                rx="3"
                :fill="n.knoten?.length ? 'var(--fg)' : 'var(--bg2)'"
                :stroke="selNode === n.id ? 'var(--accent)' : 'var(--fg)'"
                stroke-width="1.5"
              />
              <text
                :x="pos.get(n.id)!.x"
                :y="pos.get(n.id)!.y - 11"
                font-size="10"
                text-anchor="middle"
                fill="var(--fg)"
                font-weight="600"
              >
                {{ n.name }}
              </text>
              <text
                v-if="n.knoten?.length"
                :x="pos.get(n.id)!.x"
                :y="pos.get(n.id)!.y + 19"
                font-size="9"
                text-anchor="middle"
                class="mono"
                fill="var(--accent)"
              >
                {{ n.knoten.map((m) => ":" + String(m).padStart(2, "0")).join(" ") }}
              </text>
            </g>
          </svg>
        </div>
        <aside class="card p-2 text-sm">
          <template v-if="line">
            <b :style="{ color: categoryColor(line.cat) }">{{ line.cat }}</b> {{ line.name }}
            <div class="muted text-xs">
              {{ $t("netz.takt") }} {{ line.takt ? line.takt + "′" : "–" }} · {{ line.trips }}× ·
              {{ line.numbers }}
              <template v-if="line.symmetry !== undefined && line.symmetry !== null">
                · {{ $t("netz.symmetry") }} {{ line.symmetry }}</template
              >
            </div>
            <ol class="m-0 mt-2 list-none p-0 mono text-xs">
              <li v-for="(s, i) in line.stops" :key="i" class="flex gap-2">
                <span class="w-6 text-right muted">{{ mm(s.arr) }}</span>
                <span class="w-6 text-right">{{ mm(s.dep) }}</span>
                <span class="font-sans">{{ nodeName(s.node) }}</span>
              </li>
            </ol>
          </template>
          <template v-else-if="node">
            <b>{{ node.name }}</b>
            <div v-if="node.knoten?.length" class="text-xs">
              {{ $t("netz.knoten") }}:
              {{ node.knoten.map((m) => ":" + String(m).padStart(2, "0")).join(" ") }}
            </div>
            <ul class="m-0 mt-2 list-none p-0 text-xs">
              <li v-for="l in nodeLines" :key="l.id" class="cursor-pointer" @click="selLine = l.id">
                <b :style="{ color: categoryColor(l.cat) }">{{ l.cat }}</b> {{ l.name }}
                <span class="muted">{{ l.takt ? l.takt + "′" : "" }}</span>
              </li>
            </ul>
          </template>
          <p v-else class="muted text-xs">
            {{ $t("netz.knoten") }} · {{ $t("netz.takt") }} — click a node or line.
          </p>
        </aside>
      </div>
    </template>
  </section>
</template>
