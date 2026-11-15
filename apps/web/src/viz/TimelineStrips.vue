<script setup lang="ts">
// Gantt-style rows on a shared time axis: one row per journey, one bar per leg.
// Realtime: planned bar ghosted behind the actual bar. Transfers labelled, red when tight.
import type { Journey, Leg } from "@zugx/hafas";
import { useResizeObserver } from "@vueuse/core";
import { computed, ref } from "vue";
import { fmtDuration, hhmm, ms, VIENNA } from "../lib/format.ts";
import { lineColor } from "../lib/products.ts";

const props = defineProps<{ journeys: Journey[]; selected?: number }>();
const emit = defineEmits<{ select: [number] }>();

const ROW = 34;
const PAD_TOP = 22;
const width = ref(900);
const box = ref<HTMLDivElement>();
useResizeObserver(box, ([e]) => {
  if (e) width.value = Math.max(640, Math.round(e.contentRect.width));
});
const W_ = computed(() => width.value);

const t = (ev: { planned: string; actual?: string }) => ms(ev.actual ?? ev.planned);

const domain = computed(() => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const j of props.journeys) {
    lo = Math.min(lo, ms(j.dep.planned), t(j.dep));
    hi = Math.max(hi, ms(j.arr.planned), t(j.arr));
  }
  if (!Number.isFinite(lo)) return [0, 1] as const;
  const span = Math.max(hi - lo, 30 * 60_000);
  return [lo - span * 0.01, lo + span * 1.01] as const;
});

const x = (v: number) =>
  ((v - domain.value[0]) / (domain.value[1] - domain.value[0])) * (W_.value - 48);

const ticks = computed(() => {
  const [lo, hi] = domain.value;
  const span = hi - lo;
  const step =
    [15, 30, 60, 120, 180, 360].map((m) => m * 60_000).find((s) => span / s <= 12) ?? 720 * 60_000;
  const out: { x: number; label: string }[] = [];
  // align to Vienna wall-clock: shift by the UTC offset, so 2/3/6 h steps hit 06:00, 12:00 …
  const zoned = (v: number) => Temporal.Instant.fromEpochMilliseconds(v).toZonedDateTimeISO(VIENNA);
  const off = Number.isFinite(lo) ? zoned(lo).offsetNanoseconds / 1e6 : 0;
  for (let v = Math.ceil((lo + off) / step) * step - off; v <= hi; v += step) {
    const z = zoned(v);
    const label = `${String(z.hour).padStart(2, "0")}:${String(z.minute).padStart(2, "0")}`;
    out.push({ x: x(v), label });
  }
  return out;
});

interface Bar {
  x1: number;
  x2: number;
  px1: number;
  px2: number;
  color: string;
  label: string;
  walk: boolean;
  cancelled: boolean;
  delayed: boolean;
  title: string;
}

interface Gap {
  x1: number;
  x2: number;
  min: number;
  tight: boolean;
  broken: boolean;
}

function legTitle(l: Leg) {
  return `${l.line?.name ?? "🚶"} ${hhmm(l.dep.planned)} ${l.origin.name} → ${hhmm(l.arr.planned)} ${l.destination.name}`;
}

const rows = computed(() =>
  props.journeys.map((j) => {
    const bars: Bar[] = j.legs.map((l) => ({
      x1: x(t(l.dep)),
      x2: Math.max(x(t(l.arr)), x(t(l.dep)) + 2),
      px1: x(ms(l.dep.planned)),
      px2: x(ms(l.arr.planned)),
      color: l.kind === "journey" ? lineColor(l.line) : "var(--muted)",
      label: l.kind === "journey" ? (l.line?.name ?? "") : "",
      walk: l.kind !== "journey",
      cancelled: !!l.cancelled || !!l.dep.cancelled || !!l.arr.cancelled,
      delayed: (l.dep.delay ?? 0) !== 0 || (l.arr.delay ?? 0) !== 0,
      title: legTitle(l),
    }));
    // transfer gaps between consecutive vehicle legs
    const gaps: Gap[] = [];
    const vehicle = j.legs.filter((l) => l.kind === "journey");
    for (let i = 1; i < vehicle.length; i++) {
      const a = vehicle[i - 1]!;
      const b = vehicle[i]!;
      const min = Math.round((t(b.dep) - t(a.arr)) / 60_000);
      gaps.push({ x1: x(t(a.arr)), x2: x(t(b.dep)), min, tight: min < 5, broken: min < 0 });
    }
    // stable key: new rows (paging) fade in instead of every row re-rendering
    const key = j.legs.map((l) => `${l.journeyId ?? ""}${l.dep.planned}`).join("|");
    return { j, bars, gaps, key };
  }),
);

const height = computed(() => PAD_TOP + rows.value.length * ROW + 4);
</script>

<template>
  <div ref="box" class="w-full overflow-x-auto">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="block select-none"
      :width="width"
      :height="height"
      role="img"
      aria-label="timeline"
    >
      <g class="mono" font-size="10" fill="var(--muted)">
        <g v-for="tk in ticks" :key="tk.x">
          <line
            :x1="tk.x"
            :x2="tk.x"
            :y1="PAD_TOP - 6"
            :y2="height"
            stroke="var(--line)"
            vector-effect="non-scaling-stroke"
          />
          <text :x="tk.x + 2" y="12">{{ tk.label }}</text>
        </g>
      </g>
      <TransitionGroup tag="g" name="row-fade">
        <g
          v-for="(r, i) in rows"
          :key="r.key"
          :transform="`translate(0 ${PAD_TOP + i * ROW})`"
          class="cursor-pointer"
          @click="emit('select', i)"
        >
          <rect
            x="0"
            y="0"
            :width="width"
            :height="ROW"
            :fill="i === selected ? 'var(--bg3)' : 'transparent'"
          />
          <g v-for="(b, k) in r.bars" :key="k" v-tip="b.title">
            <!-- planned ghost -->
            <rect
              v-if="b.delayed && !b.walk"
              :x="b.px1"
              y="8"
              :width="Math.max(1, b.px2 - b.px1)"
              height="18"
              rx="3"
              :fill="b.color"
              opacity="0.25"
            />
            <line
              v-if="b.walk"
              :x1="b.x1"
              :x2="b.x2"
              y1="17"
              y2="17"
              stroke="var(--muted)"
              stroke-width="2"
              stroke-dasharray="2 3"
              vector-effect="non-scaling-stroke"
            />
            <rect
              v-else
              :x="b.x1"
              y="8"
              :width="Math.max(2, b.x2 - b.x1)"
              height="18"
              rx="3"
              :fill="b.color"
              :opacity="b.cancelled ? 0.35 : 1"
            />
            <text
              v-if="!b.walk && b.x2 - b.x1 > b.label.length * 6.5 + 6"
              :x="b.x1 + 4"
              y="21"
              font-size="11"
              fill="#fff"
              class="mono"
              font-weight="600"
            >
              {{ b.label }}
            </text>
          </g>
          <g v-for="(g, k) in r.gaps" :key="'g' + k">
            <text
              v-if="Math.abs(g.x2 - g.x1) > 14"
              :x="(g.x1 + g.x2) / 2"
              y="31"
              font-size="9"
              text-anchor="middle"
              class="mono"
              :fill="g.broken ? 'var(--bad)' : g.tight ? 'var(--warn)' : 'var(--muted)'"
            >
              {{ g.min }}′
            </text>
            <line
              v-if="g.broken"
              :x1="g.x2"
              :x2="g.x1"
              y1="5"
              y2="29"
              stroke="var(--bad)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <text
            :x="width - 4"
            y="21"
            font-size="10"
            text-anchor="end"
            fill="var(--muted)"
            class="mono"
          >
            {{ fmtDuration(r.j.duration) }}
          </text>
        </g>
      </TransitionGroup>
    </svg>
  </div>
</template>
