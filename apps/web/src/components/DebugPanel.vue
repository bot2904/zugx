<script setup lang="ts">
import { computed, ref } from "vue";
import { exchanges } from "../lib/api.ts";
import { state } from "../lib/store.ts";

const open = ref<number>(0);
const tab = ref<"response" | "request">("response");
const pretty = (x: unknown) => JSON.stringify(x, null, 2);
const current = computed(() => exchanges[open.value]);
</script>

<template>
  <section class="card mx-auto my-4 max-w-6xl p-2 text-xs">
    <div class="mb-2 flex items-center gap-2">
      <b>{{ $t("debug.title") }}</b>
      <span class="muted">mgate.exe · {{ exchanges.length }}</span>
      <button class="btn ml-auto" :class="tab === 'request' && 'btn-on'" @click="tab = 'request'">
        {{ $t("debug.request") }}
      </button>
      <button class="btn" :class="tab === 'response' && 'btn-on'" @click="tab = 'response'">
        {{ $t("debug.response") }}
      </button>
      <button class="btn" @click="state.debug = false">✕</button>
    </div>
    <div class="flex gap-2">
      <ol class="m-0 w-56 shrink-0 list-none overflow-auto p-0" style="max-height: 50vh">
        <li v-for="(ex, i) in exchanges" :key="i">
          <button
            class="w-full cursor-pointer border-0 bg-transparent px-1 py-0.5 text-left text-[var(--fg)] mono"
            :class="open === i && 'bg-[var(--bg3)]'"
            @click="open = i"
          >
            {{ ex.meth }}
            <span class="muted">{{ ex.cached ? $t("debug.cached") : ex.ms + "ms" }}</span>
          </button>
        </li>
      </ol>
      <pre v-if="current" class="m-0 flex-1 overflow-auto mono" style="max-height: 50vh">{{
        pretty(tab === "request" ? current.request : current.response)
      }}</pre>
    </div>
  </section>
</template>
