/// <reference types="vite-plus/client" />
// Shim for tools without SFC support (tsgolint); vue-tsc type-checks .vue files for real.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
