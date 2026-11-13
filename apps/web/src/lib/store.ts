// Tiny persisted state: recents, favourites, settings.
import { reactive, watch } from "vue";

export interface SavedStation {
  id: string;
  name: string;
}

interface State {
  recents: SavedStation[];
  favourites: SavedStation[];
  recentJourneys: { from: SavedStation; to: SavedStation }[];
  debug: boolean;
  theme: "dark" | "light";
  view: "timeline" | "table";
}

const KEY = "zugx:state";

function load(): State {
  const def: State = {
    recents: [],
    favourites: [],
    recentJourneys: [],
    debug: false,
    theme: (document.documentElement.dataset.theme as State["theme"]) ?? "dark",
    view: "timeline",
  };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return def;
  }
}

export const state = reactive<State>(load());

watch(
  state,
  (s) => {
    localStorage.setItem(KEY, JSON.stringify(s));
    document.documentElement.dataset.theme = s.theme;
    localStorage.setItem("zugx:theme", s.theme);
  },
  { deep: true },
);

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
