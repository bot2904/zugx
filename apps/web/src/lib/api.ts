// Shared HAFAS client: same-origin proxy, client-side cache, raw exchange log for the debug view.
import { createClient, type Exchange, type HafasClient } from "@zugx/hafas";
import { shallowReactive } from "vue";
import { hafasLang } from "../i18n/index.ts";

export const exchanges = shallowReactive<Exchange[]>([]);

const clients = new Map<string, HafasClient>();

export function api(): HafasClient {
  const lang = hafasLang();
  let c = clients.get(lang);
  if (!c) {
    c = createClient({
      endpoint: "/api/mgate",
      lang,
      ttl: 30_000,
      onExchange: (ex) => {
        exchanges.unshift(ex);
        if (exchanges.length > 30) exchanges.length = 30;
      },
    });
    clients.set(lang, c);
  }
  return c;
}
