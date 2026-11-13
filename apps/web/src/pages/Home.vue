<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import StationInput from "../components/StationInput.vue";
import { toLocalInput } from "../lib/format.ts";
import { addRecent, addRecentJourney, state, type SavedStation } from "../lib/store.ts";
import { trainSlug } from "../lib/url.ts";

const router = useRouter();
const from = ref<SavedStation>();
const to = ref<SavedStation>();
const via = ref<SavedStation>();
const showVia = ref(false);
const when = ref("");
const arrival = ref(false);
const train = ref("");
const toInput = ref<InstanceType<typeof StationInput>>();

function search() {
  if (!from.value) return;
  addRecent(from.value);
  if (!to.value) {
    void router.push(`/station/${from.value.id}${when.value ? `?t=${when.value}` : ""}`);
    return;
  }
  addRecent(to.value);
  addRecentJourney(from.value, to.value);
  const q = new URLSearchParams();
  if (when.value) q.set("t", when.value);
  if (arrival.value) q.set("arr", "1");
  if (via.value) q.set("via", via.value.id);
  const qs = q.toString();
  void router.push(`/j/${from.value.id}/${to.value.id}${qs ? `?${qs}` : ""}`);
}

function swap() {
  [from.value, to.value] = [to.value, from.value];
}

function goTrain() {
  if (train.value.trim()) void router.push(`/train/${trainSlug(train.value.toUpperCase())}`);
}

const nowInput = () => (when.value = toLocalInput(new Date()));
</script>

<template>
  <section class="mx-auto max-w-3xl py-6">
    <h1 class="mono m-0 text-2xl"><span class="text-[var(--accent)]">z</span>ugx</h1>
    <p class="muted mt-1">{{ $t("app.tagline") }}</p>

    <form class="card mt-4 grid gap-2 p-3" data-search @submit.prevent="search">
      <div class="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <StationInput
          id="from"
          v-model="from"
          :label="$t('search.from')"
          autofocus
          @pick="toInput?.focus()"
        />
        <button
          type="button"
          class="btn mb-0.5 justify-center"
          :title="$t('search.swap')"
          @click="swap"
        >
          ⇄
        </button>
        <StationInput id="to" ref="toInput" v-model="to" :label="$t('search.to')" />
      </div>
      <StationInput v-if="showVia" id="via" v-model="via" :label="$t('search.via')" />
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <button v-if="!showVia" type="button" class="btn" @click="showVia = true">
          + {{ $t("search.via") }}
        </button>
        <label class="flex items-center gap-1">
          <input v-model="arrival" type="checkbox" /> {{ $t("search.arrival") }}
        </label>
        <input
          v-model="when"
          type="datetime-local"
          class="input text-sm"
          :aria-label="$t('board.time')"
        />
        <button type="button" class="btn" @click="nowInput">{{ $t("search.now") }}</button>
        <button type="submit" class="btn btn-on ml-auto px-4" :disabled="!from">
          {{ to ? $t("search.go") : $t("search.board") }} ↵
        </button>
      </div>
    </form>

    <form class="mt-3 flex gap-2" @submit.prevent="goTrain">
      <input v-model="train" class="input mono flex-1" :placeholder="$t('search.trainHint')" />
      <button class="btn" type="submit">🚆</button>
    </form>

    <div class="mt-6 grid gap-6 sm:grid-cols-2">
      <div v-if="state.recentJourneys.length">
        <h2 class="muted m-0 mb-1 text-xs uppercase">{{ $t("search.recents") }}</h2>
        <ul class="m-0 list-none p-0">
          <li v-for="r in state.recentJourneys" :key="r.from.id + r.to.id">
            <RouterLink :to="`/j/${r.from.id}/${r.to.id}`"
              >{{ r.from.name }} → {{ r.to.name }}</RouterLink
            >
          </li>
        </ul>
      </div>
      <div v-if="state.favourites.length || state.recents.length">
        <h2 class="muted m-0 mb-1 text-xs uppercase">{{ $t("search.board") }}</h2>
        <ul class="m-0 list-none p-0">
          <li
            v-for="s in [
              ...state.favourites,
              ...state.recents.filter((r) => !state.favourites.some((f) => f.id === r.id)),
            ]"
            :key="s.id"
          >
            <RouterLink :to="`/station/${s.id}`">{{ s.name }}</RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
