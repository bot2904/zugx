<script setup lang="ts">
// Read-only Netzgrafik: nodes (Knoten) + line sections with departure/arrival minutes at both ends.
import type { EdgeLine, NetzLine, NetzModel, NetzNode } from "@zugx/netz";
import { computed, onMounted, ref, shallowRef } from "vue";
import { categoryColor } from "../lib/products.ts";

const files = import.meta.glob<{ default: NetzModel }>("../../../../packages/netz/data/netz.json");
const ngeUrl = Object.values(
  import.meta.glob("../../../../packages/netz/data/nge.json", {
    query: "?url",
    import: "default",
    eager: true,
  }),
)[0] as string | undefined;

const netz = shallowRef<NetzModel>();
const loading = ref(true);
const selLine = ref<string>();
const selNode = ref<string>();
const hiddenCats = ref(new Set<string>());
const maxTakt = ref(0);

onMounted(async () => {
  const loader = Object.values(files)[0];
  if (loader) netz.value = (await loader()).default;
  loading.value = false;
});

// schematic x/y (km) from the build, fitted to the viewBox
const W = 1200;
const H = 620;
const PAD = 60;
const pos = computed(() => {
  const ns = netz.value?.nodes ?? [];
  const xs = ns.map((n) => n.x);
  const ys = ns.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((W - 2 * PAD) / (x1 - x0 || 1), (H - 2 * PAD) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * k) / 2;
  const oy = (H - (y1 - y0) * k) / 2;
  return new Map(ns.map((n) => [n.id, { x: ox + (n.x - x0) * k, y: oy + (n.y - y0) * k }]));
});

const lineById = computed(() => new Map((netz.value?.lines ?? []).map((l) => [l.id, l])));
const visible = (l?: NetzLine) =>
  !!l &&
  !hiddenCats.value.has(l.cat) &&
  (!maxTakt.value || (l.takt !== null && l.takt <= maxTakt.value));

interface Seg {
  el: EdgeLine;
  line: NetzLine;
  a: string;
  b: string;
  offset: number;
  n: number;
}

const segs = computed<Seg[]>(() => {
  const out: Seg[] = [];
  for (const e of netz.value?.edges ?? []) {
    const ls = e.lines.filter((el) => visible(lineById.value.get(el.line)));
    ls.forEach((el, i) =>
      out.push({ el, line: lineById.value.get(el.line)!, a: e.a, b: e.b, offset: i, n: ls.length }),
    );
  }
  return out;
});

function geom(s: Seg) {
  const p = pos.value.get(s.a)!;
  const q = pos.value.get(s.b)!;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const o = (s.offset - (s.n - 1) / 2) * 6;
  const ax = p.x + nx * o;
  const ay = p.y + ny * o;
  const f = Math.min(0.3, 26 / len);
  const at = (t: number) => ({ x: ax + dx * t, y: ay + dy * t });
  return {
    ax,
    ay,
    bx: q.x + nx * o,
    by: q.y + ny * o,
    nearA: at(f),
    nearB: at(1 - f),
    mid: at(0.5),
    len,
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
const node = computed<NetzNode | undefined>(() =>
  netz.value?.nodes.find((n) => n.id === selNode.value),
);
const nodeLines = computed(() =>
  (netz.value?.lines ?? []).filter(
    (l) =>
      visible(l) &&
      [...l.fwd.stops, ...(l.back?.stops ?? [])].some((s) => s.node === selNode.value),
  ),
);
const line = computed(() => (selLine.value ? lineById.value.get(selLine.value) : undefined));
const nodeName = (id: string) => netz.value?.nodes.find((n) => n.id === id)?.name ?? id;
const knotColor = (n: NetzNode) =>
  n.knots.type === "voll"
    ? "var(--accent)"
    : n.knots.type === "halb"
      ? "var(--warn)"
      : n.knots.type
        ? "var(--link)"
        : "var(--bg2)";
const knotLabel = (n: NetzNode) =>
  n.knots.minutes.map((m) => `:${String(m).padStart(2, "0")}`).join(" ");
const lineWidth = (l: NetzLine) => (l.takt && l.takt <= 30 ? 3 : l.takt === 60 ? 2 : 1.3);
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
        <span class="chips flex flex-wrap gap-1">
          <button
            v-for="c in cats"
            :key="c"
            class="btn chip py-0.5 text-xs"
            :class="hiddenCats.has(c) && 'muted line-through'"
            :style="{ borderColor: categoryColor(c) }"
            @click="toggleCat(c)"
          >
            {{ c }}
          </button>
        </span>
        <label class="ml-2 flex items-center gap-1">
          {{ $t("netz.takt") }} ≤
          <select v-model.number="maxTakt" class="input text-xs">
            <option :value="0">*</option>
            <option :value="30">30′</option>
            <option :value="60">60′</option>
            <option :value="120">120′</option>
          </select>
        </label>
        <span class="muted ml-auto">{{ netz.day }} · {{ netz.source }}</span>
      </div>
      <div class="grid gap-3 2xl:grid-cols-[1fr_300px]">
        <div class="card overflow-x-auto p-1">
          <svg
            :viewBox="`0 0 ${W} ${H}`"
            class="block w-full min-w-[640px]"
            role="img"
            :aria-label="$t('netz.title')"
          >
            <g
              v-for="(s, i) in segs"
              :key="i"
              class="cursor-pointer"
              :opacity="
                selLine
                  ? selLine === s.line.id
                    ? 1
                    : 0.12
                  : selNode && !nodeLines.includes(s.line)
                    ? 0.25
                    : 1
              "
              @click="selLine = selLine === s.line.id ? undefined : s.line.id"
            >
              <title>{{ s.line.cat }} {{ s.line.name }} ({{ s.line.takt ?? "–" }}′)</title>
              <line
                :x1="geom(s).ax"
                :y1="geom(s).ay"
                :x2="geom(s).bx"
                :y2="geom(s).by"
                :stroke="categoryColor(s.line.cat)"
                :stroke-width="lineWidth(s.line)"
                :stroke-dasharray="!s.line.takt || s.line.takt > 60 ? '5 3' : undefined"
              />
              <template
                v-if="geom(s).len > 60 && (selLine === s.line.id || segs.length < 140 || s.n === 1)"
              >
                <text
                  :x="geom(s).nearA.x"
                  :y="geom(s).nearA.y - 2"
                  font-size="8"
                  text-anchor="middle"
                  class="mono"
                  fill="var(--fg)"
                >
                  {{ mm(s.el.aDep)
                  }}<tspan fill="var(--muted)">{{
                    s.el.aArr !== null ? "/" + mm(s.el.aArr) : ""
                  }}</tspan>
                </text>
                <text
                  :x="geom(s).nearB.x"
                  :y="geom(s).nearB.y - 2"
                  font-size="8"
                  text-anchor="middle"
                  class="mono"
                  fill="var(--fg)"
                >
                  <tspan fill="var(--muted)">{{ mm(s.el.bArr) }}</tspan
                  >{{ s.el.bDep !== null ? "/" + mm(s.el.bDep) : "" }}
                </text>
                <text
                  v-if="s.el.travel !== null && geom(s).len > 110"
                  :x="geom(s).mid.x"
                  :y="geom(s).mid.y + 9"
                  font-size="8"
                  text-anchor="middle"
                  class="mono"
                  fill="var(--muted)"
                >
                  {{ s.el.travel }}′
                </text>
              </template>
            </g>
            <g
              v-for="n in netz.nodes"
              :key="n.id"
              class="cursor-pointer"
              @click="
                selNode = selNode === n.id ? undefined : n.id;
                selLine = undefined;
              "
            >
              <title>{{ n.name }}{{ n.knots.minutes.length ? " · " + knotLabel(n) : "" }}</title>
              <rect
                :x="pos.get(n.id)!.x - 9"
                :y="pos.get(n.id)!.y - 9"
                width="18"
                height="18"
                rx="4"
                :fill="knotColor(n)"
                :stroke="selNode === n.id ? 'var(--accent)' : 'var(--fg)'"
                :stroke-width="selNode === n.id ? 2.5 : 1.2"
              />
              <text
                :x="pos.get(n.id)!.x"
                :y="pos.get(n.id)!.y + 3"
                font-size="7"
                text-anchor="middle"
                class="mono"
                :fill="n.knots.type ? '#fff' : 'var(--fg)'"
                font-weight="700"
              >
                {{ n.code }}
              </text>
              <text
                :x="pos.get(n.id)!.x"
                :y="pos.get(n.id)!.y - 13"
                font-size="10"
                text-anchor="middle"
                fill="var(--fg)"
              >
                {{ n.name }}
              </text>
            </g>
          </svg>
          <p class="muted m-1 flex flex-wrap gap-3 text-xs">
            <span><b class="text-[var(--accent)]">■</b> :00 Vollknoten</span>
            <span><b class="text-[var(--warn)]">■</b> :30 Halbknoten</span>
            <span><b class="text-[var(--link)]">■</b> :15/:45</span>
            <span>━ 30′ · ── 60′ · ╌ 120′/–</span>
            <span class="mono">dep/arr</span>
          </p>
        </div>
        <aside class="card p-2 text-sm">
          <template v-if="line">
            <b :style="{ color: categoryColor(line.cat) }">{{ line.cat }}</b> {{ line.name }}
            <div class="muted text-xs">
              {{ $t("netz.takt") }} {{ line.takt ? line.takt + "′" : "–" }}
              <template v-if="line.symmetry !== null">
                · {{ $t("netz.symmetry") }} {{ line.symmetry > 0 ? "+" : ""
                }}{{ line.symmetry }}′</template
              >
            </div>
            <div v-for="d in [line.fwd, line.back].filter(Boolean)" :key="d!.to" class="mt-2">
              <div class="text-xs">
                → {{ d!.to }} · {{ d!.trips }}× · {{ d!.first }}–{{ d!.last }}
                <div class="muted">{{ d!.numbers }}</div>
              </div>
              <ol class="m-0 mt-1 list-none p-0 mono text-xs">
                <li
                  v-for="(s, i) in d!.stops"
                  :key="i"
                  class="flex gap-2"
                  :class="s.pass && 'muted italic'"
                >
                  <span class="w-6 text-right muted">{{ mm(s.arr) }}</span>
                  <span class="w-6 text-right">{{ mm(s.dep) }}</span>
                  <span class="font-sans">{{ nodeName(s.node) }}</span>
                </li>
              </ol>
            </div>
          </template>
          <template v-else-if="node">
            <b>{{ node.name }}</b>
            <RouterLink v-if="node.hafasId" :to="`/station/${node.hafasId}`" class="ml-2 text-xs"
              >{{ $t("search.board") }} →</RouterLink
            >
            <div class="text-xs">
              {{ $t("netz.knoten") }}: {{ knotLabel(node) || "–" }} ({{
                Math.round(node.knots.share * 100)
              }}
              %)
            </div>
            <svg viewBox="0 0 120 30" class="mt-1 block w-full" aria-hidden="true">
              <rect
                v-for="(c, m) in node.knots.arr"
                :key="'a' + m"
                :x="m * 2"
                :y="15 - c * 4"
                width="1.6"
                :height="c * 4"
                fill="var(--muted)"
              />
              <rect
                v-for="(c, m) in node.knots.dep"
                :key="'d' + m"
                :x="m * 2"
                y="15"
                width="1.6"
                :height="c * 4"
                fill="var(--accent)"
              />
              <line x1="0" x2="120" y1="15" y2="15" stroke="var(--line)" stroke-width="0.3" />
            </svg>
            <ul class="m-0 mt-2 list-none p-0 text-xs">
              <li v-for="l in nodeLines" :key="l.id" class="cursor-pointer" @click="selLine = l.id">
                <b :style="{ color: categoryColor(l.cat) }">{{ l.cat }}</b> {{ l.name }}
                <span class="muted">{{ l.takt ? l.takt + "′" : "" }}</span>
              </li>
            </ul>
          </template>
          <p v-else class="muted text-xs">
            {{ netz.nodes.length }} Knoten · {{ netz.lines.length }} lines · click a node or line.
          </p>
        </aside>
      </div>
    </template>
  </section>
</template>
