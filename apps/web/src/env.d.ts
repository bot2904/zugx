/// <reference types="vite-plus/client" />

interface ImportMetaEnv {
  /** abbreviated hash of the last commit at build time, empty if unknown */
  readonly VITE_COMMIT_HASH?: string;
  /** committer date (YYYY-MM-DD) of the last commit at build time */
  readonly VITE_COMMIT_DATE?: string;
}
// Shim for tools without SFC support (tsgolint); vue-tsc type-checks .vue files for real.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
