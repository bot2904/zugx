<script setup lang="ts">
// "Add to calendar": builds an .ics for the journey with a deep link back to its permalink.
import type { Journey } from "@zugx/hafas";
import { useI18n } from "../i18n/index.ts";
import { addToCalendar, buildIcs } from "../lib/ical.ts";
import { b64url } from "../lib/url.ts";

const props = defineProps<{ journey: Journey }>();
const { t } = useI18n();

async function add() {
  const j = props.journey;
  const url = j.recon ? `${location.origin}/trip/${b64url(j.recon)}` : location.href;
  const ics = buildIcs(j, url, {
    platform: t("common.platform"),
    transfer: (min) => t("journeys.transfer", { min }),
    walk: (min) => t("journeys.walk", { min }),
    duration: t("journeys.duration"),
    transfers: t("journeys.transfers"),
    realtime: t("calendar.realtime"),
    open: t("calendar.open"),
  });
  const from = j.legs[0]?.origin.name ?? "";
  const to = j.legs.at(-1)?.destination.name ?? "";
  const name = `${j.dep.planned.slice(0, 10)} ${from} - ${to}`.replace(/[^\p{L}\p{N} .-]+/gu, "_");
  await addToCalendar(ics, `${name}.ics`);
}
</script>

<template>
  <button class="btn text-xs" v-tip="$t('calendar.add')" @click="add">
    📅 {{ $t("calendar.add") }}
  </button>
</template>
