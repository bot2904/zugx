<script setup lang="ts">
// Box "Zugteile": the trains this one is joined with, per stretch of the run (HAFAS parJnySegL),
// and the operational train where it can be told (see @zugx/hafas coupled.ts). Each train links to
// its own run. Used by the train page and the radar panel.
import { partSections, type PartSection, type Trip } from "@zugx/hafas";
import { computed } from "vue";
import LineBadge from "./LineBadge.vue";

const props = defineProps<{ trip: Trip }>();
const sections = computed(() => partSections(props.trip));
const stop = (i: number) => props.trip.stopovers[i]?.stop.name ?? "";
/** joined trains besides the operational one */
const others = (s: PartSection) => s.with.filter((p) => p.journeyId !== s.operational?.journeyId);
const link = (jid: string) => `/train/${encodeURIComponent(jid)}`;
</script>

<template>
  <section v-if="sections.length" class="parts text-xs" :aria-label="$t('trip.parts')">
    <h2 class="muted m-0 mb-1 text-xs uppercase">{{ $t("trip.parts") }}</h2>
    <ul class="m-0 list-none p-0">
      <li v-for="(s, k) in sections" :key="k" class="py-0.5">
        <span class="muted">{{ stop(s.from) }} – {{ stop(s.to) }}:</span>
        <template v-if="s.operational">
          {{ " "
          }}<span
            v-tip="$t(s.operational.hint ? 'trip.operationalHintTip' : 'trip.operationalTip')"
            >{{ $t("trip.operational") }}</span
          >
          <RouterLink
            v-if="s.operational.journeyId"
            :to="link(s.operational.journeyId)"
            class="ml-1"
            ><LineBadge :line="s.operational.line" small
          /></RouterLink>
          <template v-else
            ><LineBadge :line="s.operational.line" small class="ml-1" />
            <span class="muted ml-1">({{ $t("trip.byHafas") }})</span></template
          >
        </template>
        <template v-if="others(s).length">
          <template v-if="s.operational"> ·</template>
          {{ $t("trip.joinedWith") }}
          <RouterLink v-for="p in others(s)" :key="p.journeyId" :to="link(p.journeyId)" class="ml-1"
            ><LineBadge :line="p.line" small
          /></RouterLink>
        </template>
      </li>
    </ul>
  </section>
</template>
