<script setup lang="ts">
// Stop list of a train run: line with the current position, arrival/departure (realtime),
// station → departure board, platform, remarks. Used by the train page and the radar panel.
import { operationalChanges, partSections, type Stopover, type Trip } from "@zugx/hafas";
import { computed } from "vue";
import EventTime from "./EventTime.vue";
import Platform from "./Platform.vue";
import LineBadge from "./LineBadge.vue";
import Remarks from "./Remarks.vue";
import { ms } from "../lib/format.ts";
import { lineColor } from "../lib/products.ts";

const props = defineProps<{ trip: Trip; now: number }>();

const t = (s: Stopover) => ms(s.dep?.actual ?? s.dep?.planned ?? s.arr?.actual ?? s.arr?.planned);
const tArr = (s: Stopover) =>
  ms(s.arr?.actual ?? s.arr?.planned ?? s.dep?.actual ?? s.dep?.planned);

/** index of the last stop the train has departed from (−1 = not started) */
const position = computed(() => {
  let last = -1;
  props.trip.stopovers.forEach((s, i) => {
    if (t(s) <= props.now) last = i;
  });
  return last;
});
const atStation = (i: number) => {
  const s = props.trip.stopovers[i];
  return !!s && tArr(s) <= props.now && t(s) > props.now;
};
/**
 * boarding restrictions as in the ÖBB Kursbuch (Zeichenerklärung): ◗ only boarding, ◖ only
 * alighting, | no stop for passengers (passing) — instead of a remark line per stop
 */
const SIGNS: Record<string, string> = {
  "text.realtime.stop.exit.disabled": "◗",
  "text.realtime.stop.entry.disabled": "◖",
  "text.realtime.stop.entry.exit.disabled": "|",
};
const sign = (s: Stopover) => s.remarks?.find((r) => r.code && SIGNS[r.code]);
const otherRemarks = (s: Stopover) => s.remarks?.filter((r) => !(r.code && SIGNS[r.code])) ?? [];

/** coupled commercial-only parts: stops where the operational train changes ("ab hier NJ 466") */
const opChanges = computed(() => operationalChanges(partSections(props.trip)));
defineExpose({ position });
</script>

<template>
  <ol class="m-0 list-none p-0">
    <li
      v-for="(s, i) in trip.stopovers"
      :key="i"
      class="relative grid grid-cols-[1.25rem_4.4rem_4.4rem_1fr_auto] items-center gap-x-2 py-0.5 text-sm"
      :class="[s.cancelled && 'line-through muted', i <= position && 'opacity-60']"
    >
      <span class="relative flex h-full justify-center">
        <span
          class="absolute w-1"
          :class="
            i === 0
              ? 'top-1/2 bottom-0'
              : i === trip.stopovers.length - 1
                ? 'top-0 bottom-1/2'
                : 'inset-y-0'
          "
          :style="{ background: lineColor(trip.line) }"
        />
        <span
          class="z-1 my-auto block h-2.5 w-2.5 rounded-full border-2"
          :class="atStation(i) ? 'animate-pulse' : ''"
          :style="{
            borderColor: lineColor(trip.line),
            background: atStation(i) || i === position ? lineColor(trip.line) : 'var(--bg2)',
          }"
        />
      </span>
      <!-- wrappers keep the grid columns when arr (origin) or dep (destination) is missing -->
      <span><EventTime :ev="s.arr" show-actual below /></span>
      <span><EventTime :ev="s.dep" show-actual below /></span>
      <span>
        <RouterLink :to="`/station/${s.stop.id}`" class="text-[var(--fg)]">
          {{ s.stop.name }}
          <span v-if="s.additional" class="text-xs text-[var(--warn)]">+</span>
        </RouterLink>
        <abbr
          v-if="sign(s)"
          class="stop-sign"
          tabindex="0"
          :aria-label="sign(s)!.text"
          v-tip="sign(s)!.text"
          >{{ SIGNS[sign(s)!.code!] }}</abbr
        >
      </span>
      <span class="text-right text-xs"><Platform :ev="s.dep ?? s.arr" /></span>
      <span v-if="opChanges.get(i)" class="muted col-start-4 col-end-6 text-xs">
        {{ $t("trip.fromHere") }} <LineBadge :line="opChanges.get(i)!.line" small />
      </span>
      <Remarks
        v-if="otherRemarks(s).length"
        :remarks="otherRemarks(s)"
        compact
        class="col-start-4 col-end-6"
      />
    </li>
  </ol>
</template>

<style scoped>
/* boarding restriction (Kursbuch sign) after the station name */
.stop-sign {
  margin-left: 0.375rem;
  font-size: 1rem;
  line-height: 1;
  color: var(--muted);
  text-decoration: none;
  cursor: help;
}
</style>
