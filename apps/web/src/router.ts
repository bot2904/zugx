import { createRouter, createWebHistory } from "vue-router";

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
