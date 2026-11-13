import { createRouter, createWebHistory } from "vue-router";
import { i18n } from "./i18n/index.ts";

const TITLES: Record<string, string> = {
  "/trains": "nav.trains",
  "/radar": "nav.radar",
  "/bf": "nav.bildfahrplan",
  "/netz": "nav.netz",
  "/him": "nav.him",
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
