<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CommandPalette from "./components/CommandPalette.vue";
import ModalDialog from "./components/ModalDialog.vue";
import DebugPanel from "./components/DebugPanel.vue";
import VzgAbbr from "./components/VzgAbbr.vue";
import { locale, LOCALES, setLocale, type Locale, type MessageKey } from "./i18n/index.ts";
import { useKeys } from "./lib/keys.ts";
import { state } from "./lib/store.ts";
import { scheme, toggleScheme } from "./lib/theme.ts";

const router = useRouter();
const route = useRoute();

// navigation layout: measure whether the inline list fits the header row
const headerRow = ref<HTMLElement>();
const navList = ref<HTMLElement>();
const navWide = ref(true);
let lastWidth = 0;
async function measureNav() {
  const row = headerRow.value;
  if (!row) return;
  const width = row.clientWidth;
  // while collapsed, only re-measure when the header grew (avoids layout thrash)
  if (!navWide.value && width <= lastWidth) return;
  lastWidth = width;
  navWide.value = true;
  await nextTick();
  navWide.value = row.scrollWidth <= row.clientWidth;
}
function closeMenu() {
  if (!navWide.value) navList.value?.hidePopover?.();
}
useResizeObserver(headerRow, () => void measureNav());
// translations change the width of the links
watch(
  () => locale.value,
  () => {
    lastWidth = 0;
    void measureNav();
  },
);
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

const nav: { to: string; key: MessageKey }[] = [
  { to: "/", key: "nav.search" },
  { to: "/trains", key: "nav.trains" },
  { to: "/radar", key: "nav.radar" },
  { to: "/bf", key: "nav.bildfahrplan" },
  { to: "/vzg", key: "nav.vzg" },
  { to: "/netz", key: "nav.netz" },
  { to: "/him", key: "nav.him" },
  { to: "/help", key: "nav.help" },
];

const shortcuts: [string, string][] = [
  ["/", "focus search"],
  ["Ctrl/⌘ K", "command palette"],
  ["j / k", "next / previous row"],
  ["Enter", "open row"],
  ["h / l", "earlier / later"],
  ["a", "departures ↔ arrivals"],
  ["← / →", "Bildfahrplan: previous / next day"],
  ["↑ / ↓", "Bildfahrplan: two hours earlier / later (Shift: a whole window)"],
  ["+ / −", "Bildfahrplan: time scale"],
  ["n", "Bildfahrplan: now"],
  ["d", "raw API JSON"],
  ["g / t / r", "home / trains / radar"],
  ["?", "this help"],
];
</script>

<template>
  <a href="#main" class="skip-link">{{ $t("common.skip") }}</a>
  <header class="border-b border-[var(--line)] bg-[var(--bg2)]">
    <div ref="headerRow" class="mx-auto flex max-w-6xl items-center gap-x-4 px-3 py-2">
      <RouterLink
        to="/"
        class="mono text-lg font-bold text-[var(--fg)] no-underline"
        aria-label="zugx home"
      >
        <span class="text-[var(--accent)]">z</span>ugx
      </RouterLink>
      <!-- one navigation list: inline when it fits, a native popover behind "Menu" when not
           (modern-web-guidance: navbar) -->
      <nav :aria-label="$t('nav.main')" class="text-sm">
        <button
          v-if="!navWide"
          type="button"
          class="btn"
          popovertarget="site-menu"
          aria-controls="site-menu"
        >
          <span aria-hidden="true">☰</span> {{ $t("nav.menu") }}
        </button>
        <ul
          id="site-menu"
          ref="navList"
          :popover="navWide ? undefined : 'auto'"
          class="site-menu m-0 list-none p-0"
          :class="navWide ? 'flex gap-3' : 'card p-1 shadow-lg'"
        >
          <li v-for="n in nav" :key="n.to">
            <RouterLink
              :to="n.to"
              class="block whitespace-nowrap text-[var(--muted)] hover:text-[var(--fg)]"
              :class="!navWide && 'px-3 py-2'"
              active-class="!text-[var(--fg)]"
              :exact-active-class="n.to === '/' ? '!text-[var(--fg)]' : undefined"
              @click="closeMenu"
              ><VzgAbbr v-if="n.to === '/vzg'" :text="$t(n.key)" /><template v-else>{{
                $t(n.key)
              }}</template></RouterLink
            >
          </li>
        </ul>
      </nav>
      <div class="ml-auto flex items-center gap-2 text-xs">
        <button
          class="btn hide-sm keys-only"
          v-tip="$t('common.commandPalette')"
          @click="palette = true"
        >
          <span class="kbd">⌘K</span>
        </button>
        <button
          class="btn"
          :class="state.debug && 'btn-on'"
          v-tip="$t('debug.show')"
          :aria-label="$t('debug.show')"
          @click="state.debug = !state.debug"
        >
          {}
        </button>
        <select
          class="input py-0.5 text-xs"
          :value="locale"
          :aria-label="$t('common.language')"
          @change="setLocale(($event.target as HTMLSelectElement).value as Locale)"
        >
          <option v-for="l in LOCALES" :key="l" :value="l">{{ l.toUpperCase() }}</option>
        </select>
        <button
          class="btn"
          v-tip="$t('common.theme')"
          :aria-label="$t('common.theme')"
          @click="toggleScheme"
        >
          {{ scheme === "dark" ? "☾" : "☀" }}
        </button>
      </div>
    </div>
  </header>
  <main
    id="main"
    tabindex="-1"
    class="mx-auto px-3 py-3 outline-none"
    :class="route.meta.wide ? 'max-w-none' : 'max-w-6xl'"
  >
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
    (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>),
    <a href="https://www.openstreetmap.org/copyright">© {{ $t("common.source.osm") }}</a>
    (<a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>) ·
    <a href="https://github.com/simon04/zugx">zugx</a>
    (<a href="https://github.com/simon04/zugx/blob/master/LICENSE" rel="license">AGPL-3.0</a>,
    <a href="/licenses.txt" target="_blank">{{ $t("common.ossLicenses") }}</a>) ·
    <RouterLink to="/imprint">{{ $t("common.imprint") }}</RouterLink> ·
    <RouterLink to="/privacy">{{ $t("common.privacy") }}</RouterLink>
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
  <ModalDialog v-model="help" :label="$t('common.keyboard')">
    <div class="p-2">
      <h2 class="mt-0 text-base">{{ $t("common.keyboard") }}</h2>
      <table class="dense">
        <tbody>
          <tr v-for="[k, d] in shortcuts" :key="k">
            <td><span class="kbd">{{ k }}</span></td>
            <td>{{ d }}</td>
          </tr>
        </tbody>
      </table>
      <button class="btn mt-3" autofocus @click="help = false">{{ $t("common.close") }}</button>
    </div>
  </ModalDialog>
</template>
