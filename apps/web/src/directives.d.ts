// global directives (registered in app.ts), typed for templates
import type { vTip } from "./lib/tip.ts";

declare module "vue" {
  interface GlobalDirectives {
    vTip: typeof vTip;
  }
}
export {};
