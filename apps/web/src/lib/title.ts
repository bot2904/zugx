// Document title of a detail view: "<view> · <selection …> · zugx" (e.g.
// "Bildfahrplan · 400 Innsbruck – Bludenz · zugx"); empty parts are left out. Follows the
// selection reactively; the router sets the plain "<view> · zugx" on page changes.
import { watchEffect } from "vue";

export function usePageTitle(parts: () => (string | undefined | null | false)[]) {
  watchEffect(() => {
    document.title = [...parts().filter(Boolean), "zugx"].join(" · ");
  });
}
