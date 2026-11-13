import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { i18n } from "./i18n/index.ts";

const TITLES: Record<string, string> = {
  "/trains": "nav.trains",
  "/radar": "nav.radar",
  "/bf": "nav.bildfahrplan",
  "/netz": "nav.netz",
  "/him": "nav.him",
  "/imprint": "common.imprint",
  "/privacy": "common.privacy",
};

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: "/", component: () => import("./pages/Home.vue") },
    { path: "/s", component: () => import("./pages/StationSearch.vue") },
    { path: "/station/:id", component: () => import("./pages/StationBoard.vue") },
    { path: "/j/:from/:to", component: () => import("./pages/Journeys.vue") },
    { path: "/trip/:recon", component: () => import("./pages/JourneyDetail.vue") },
    { path: "/train/:id", component: () => import("./pages/Train.vue") },
    { path: "/him", component: () => import("./pages/Him.vue") },
    { path: "/trains/:op?/:cat?", component: () => import("./pages/Trains.vue") },
    { path: "/radar", component: () => import("./pages/Radar.vue") },
    { path: "/bf/:corridor?", component: () => import("./pages/Bildfahrplan.vue") },
    { path: "/netz/:region?", component: () => import("./pages/Netz.vue") },
    { path: "/imprint", component: () => import("./pages/Imprint.vue") },
    { path: "/impressum", redirect: "/imprint" },
    { path: "/privacy", component: () => import("./pages/Privacy.vue") },
    { path: "/datenschutz", redirect: "/privacy" },
    { path: "/:rest(.*)*", component: () => import("./pages/NotFound.vue") },
  ],
});

// document title per page (detail pages set a more specific title themselves)
router.afterEach((to) => {
  const key = Object.entries(TITLES).find(
    ([p]) => to.path === p || to.path.startsWith(`${p}/`),
  )?.[1];
  document.title = key ? `${i18n.global.t(key)} · zugx` : "zugx";
});

// Page changes as a short crossfade (View Transitions API), only when the user allows motion and only
// for real page changes (not query/hash updates such as sorting or filters).
const noMotion = matchMedia("(prefers-reduced-motion: reduce)");
router.beforeResolve((to, from) => {
  if (
    !document.startViewTransition ||
    noMotion.matches ||
    !from.matched.length ||
    to.path === from.path
  )
    return;
  return new Promise<void>((resolve) => {
    document.startViewTransition(async () => {
      resolve(); // let the navigation commit …
      await new Promise<void>((done) => {
        const stop = router.afterEach(() => {
          stop();
          void nextTick(done); // … and snapshot once Vue rendered the new page
        });
      });
    });
  });
});
