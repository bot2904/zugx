<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import CommandPalette from "./components/CommandPalette.vue";
import DebugPanel from "./components/DebugPanel.vue";
import { LOCALES, setLocale, type Locale } from "./i18n/index.ts";
import { useKeys } from "./lib/keys.ts";
import { state } from "./lib/store.ts";
import { scheme, toggleScheme } from "./lib/theme.ts";

const router = useRouter();
const commitHash = import.meta.env.VITE_COMMIT_HASH;
const commitDate = import.meta.env.VITE_COMMIT_DATE;
const palette = ref(false);
const help = ref(false);

useKeys({
  "mod+k": () => (palette.value = !palette.value),
  "/": () => {
    const el = document.querySelector<HTMLInputElement>(
      "[data-search] input, input[role=combobox]",
    );
    if (el) el.focus();
    else void router.push("/");
  },
  "?": () => (help.value = !help.value),
  d: () => (state.debug = !state.debug),
  t: () => void router.push("/trains"),
  r: () => void router.push("/radar"),
  g: () => void router.push("/"),
  Escape: () => {
    help.value = false;
    palette.value = false;
  },
});

const nav = [
  { to: "/", key: "nav.search" },
  { to: "/trains", key: "nav.trains" },
  { to: "/radar", key: "nav.radar" },
  { to: "/bf", key: "nav.bildfahrplan" },
  { to: "/netz", key: "nav.netz" },
  { to: "/him", key: "nav.him" },
];

const shortcuts: [string, string][] = [
  ["/", "focus search"],
  ["Ctrl/⌘ K", "command palette"],
  ["j / k", "next / previous row"],
  ["Enter", "open row"],
  ["h / l", "earlier / later"],
  ["a", "departures ↔ arrivals"],
  ["d", "raw API JSON"],
  ["g / t / r", "home / trains / radar"],
  ["?", "this help"],
];
</script>

<template>
  <header class="border-b border-[var(--line)] bg-[var(--bg2)]">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
      <RouterLink
        to="/"
        class="mono text-lg font-bold text-[var(--fg)] no-underline"
        aria-label="zugx home"
      >
        <span class="text-[var(--accent)]">z</span>ugx
      </RouterLink>
      <nav class="flex flex-wrap gap-3 text-sm">
        <RouterLink
          v-for="n in nav"
          :key="n.to"
          :to="n.to"
          class="text-[var(--muted)] hover:text-[var(--fg)]"
          active-class="!text-[var(--fg)]"
          :exact-active-class="n.to === '/' ? '!text-[var(--fg)]' : undefined"
          >{{ $t(n.key) }}</RouterLink
        >
      </nav>
      <div class="ml-auto flex items-center gap-2 text-xs">
        <button
          class="btn hide-sm keys-only"
          :title="$t('common.commandPalette')"
          @click="palette = true"
        >
          <span class="kbd">⌘K</span>
        </button>
        <button
          class="btn"
          :class="state.debug && 'btn-on'"
          :title="$t('debug.show')"
          @click="state.debug = !state.debug"
        >
          {}
        </button>
        <select
          class="input py-0.5 text-xs"
          :value="$i18n.locale"
          :aria-label="$t('common.language')"
          @change="setLocale(($event.target as HTMLSelectElement).value as Locale)"
        >
          <option v-for="l in LOCALES" :key="l" :value="l">{{ l.toUpperCase() }}</option>
        </select>
        <button class="btn" :title="$t('common.theme')" @click="toggleScheme">
          {{ scheme === "dark" ? "☾" : "☀" }}
        </button>
      </div>
    </div>
  </header>
  <main class="mx-auto max-w-6xl px-3 py-3">
    <RouterView />
  </main>
  <DebugPanel v-if="state.debug" />
  <footer class="muted mx-auto max-w-6xl px-3 py-6 text-xs">
    {{ $t("common.source.data") }}: <a href="https://fahrplan.oebb.at/">ÖBB HAFAS</a> ({{
      $t("common.source.unofficial")
    }}),
    <a href="https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~">{{
      $t("common.source.openData")
    }}</a>
    (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>) ·
    <a href="https://github.com/simon04/zugx">zugx</a>
    (<a href="https://github.com/simon04/zugx/blob/master/LICENSE" rel="license">AGPL-3.0</a>,
    <a href="/licenses.txt" target="_blank">{{ $t("common.ossLicenses") }}</a>)
    <template v-if="commitHash">
      ·
      <a :href="`https://github.com/simon04/zugx/commit/${commitHash}`" class="mono"
        >{{ commitHash }} ({{ commitDate }})</a
      >
    </template>
    <span class="keys-only"> · </span>
    <button
      class="keys-only cursor-pointer border-0 bg-transparent p-0 text-xs text-[var(--link)]"
      @click="help = true"
    >
      {{ $t("common.keyboard") }} <span class="kbd">?</span>
    </button>
  </footer>
  <CommandPalette v-model="palette" />
  <div
    v-if="help"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="help = false"
  >
    <div class="card w-[min(420px,92vw)] p-4">
      <h2 class="mt-0 text-base">{{ $t("common.keyboard") }}</h2>
      <table class="dense">
        <tbody>
          <tr v-for="[k, d] in shortcuts" :key="k">
            <td><span class="kbd">{{ k }}</span></td>
            <td>{{ d }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
