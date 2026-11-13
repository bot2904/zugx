// Tiny persisted state: recents, favourites, settings.
import { toReactive, useLocalStorage } from "@vueuse/core";
import type { Ref } from "vue";

export interface SavedStation {
  id: string;
  name: string;
}

interface State {
  recents: SavedStation[];
  favourites: SavedStation[];
  recentJourneys: { from: SavedStation; to: SavedStation }[];
  debug: boolean;
  view: "timeline" | "table";
}

const KEY = "zugx:state";

// persisted + synced across tabs; missing fields fall back to the defaults
const stored = useLocalStorage<State>(
  KEY,
  { recents: [], favourites: [], recentJourneys: [], debug: false, view: "timeline" },
  { mergeDefaults: true },
);
export const state = toReactive(stored as Ref<State>);

export function addRecent(s: SavedStation) {
  state.recents = [s, ...state.recents.filter((r) => r.id !== s.id)].slice(0, 8);
}

export function addRecentJourney(from: SavedStation, to: SavedStation) {
  state.recentJourneys = [
    { from, to },
    ...state.recentJourneys.filter((r) => !(r.from.id === from.id && r.to.id === to.id)),
  ].slice(0, 6);
}

export function toggleFavourite(s: SavedStation) {
  const has = state.favourites.some((f) => f.id === s.id);
  state.favourites = has ? state.favourites.filter((f) => f.id !== s.id) : [...state.favourites, s];
}

export const isFavourite = (id: string) => state.favourites.some((f) => f.id === id);
