import "virtual:uno.css";
import "./style.css";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n/index.ts";
import { vTip } from "./lib/tip.ts";
import { router } from "./router.ts";

createApp(App).use(i18n).use(router).directive("tip", vTip).mount("#app");
