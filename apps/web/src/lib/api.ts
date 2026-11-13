// Shared HAFAS client: same-origin proxy, client-side cache, raw exchange log for the debug view.
import { createClient, type Exchange, type HafasClient } from "@zugx/hafas";
import { shallowReactive } from "vue";
import { hafasLang } from "../i18n/index.ts";

export const exchanges = shallowReactive<Exchange[]>([]);

const clients = new Map<string, HafasClient>();

/**
 * HAFAS client for the current UI language. `background: true` for periodic refreshes:
 * low fetch priority, so they never compete with what the user just asked for.
 */
export function api(background = false): HafasClient {
  const lang = hafasLang();
  const key = `${lang}${background ? ":bg" : ""}`;
  let c = clients.get(key);
  if (!c) {
    c = createClient({
      endpoint: "/api/mgate",
      lang,
      ...(background ? { priority: "low" as const } : {}),
      ttl: 30_000,
      onExchange: (ex) => {
        exchanges.unshift(ex);
        if (exchanges.length > 30) exchanges.length = 30;
      },
    });
    clients.set(key, c);
  }
  return c;
}
