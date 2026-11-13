<script setup lang="ts">
// MapLibre map with OSM + OpenRailwayMap raster tiles; draws lines (legs) and points (stops/trains).
import "maplibre-gl/dist/maplibre-gl.css";
import {
  LngLatBounds,
  Map as MlMap,
  NavigationControl,
  Popup,
  type GeoJSONSource,
  type LayerSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface MapLine {
  coords: [lat: number, lon: number][];
  color: string;
  dashed?: boolean;
}
export interface MapPoint {
  lat: number;
  lon: number;
  label?: string;
  color?: string;
  id?: string;
  big?: boolean;
}

const props = withDefaults(
  defineProps<{
    lines?: MapLine[];
    points?: MapPoint[];
    fit?: boolean;
    height?: string;
    railway?: boolean;
  }>(),
  { lines: () => [], points: () => [], fit: true, height: "420px", railway: true },
);
const emit = defineEmits<{ ready: [MlMap]; moveend: [MlMap]; clickPoint: [string] }>();
const el = ref<HTMLDivElement>();
let map: MlMap | undefined;
let ro: ResizeObserver | undefined;

const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });

function lineData() {
  return fc(
    props.lines.map((l) => ({
      type: "Feature",
      properties: { color: l.color, dashed: l.dashed ? 1 : 0 },
      geometry: { type: "LineString", coordinates: l.coords.map(([la, lo]) => [lo, la]) },
    })),
  );
}
function pointData() {
  return fc(
    props.points.map((p) => ({
      type: "Feature",
      properties: {
        label: p.label ?? "",
        color: p.color ?? "#e6e8eb",
        id: p.id ?? "",
        big: p.big ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  );
}

function fitAll() {
  if (!map || !props.fit) return;
  const b = new LngLatBounds();
  for (const l of props.lines) for (const [la, lo] of l.coords) b.extend([lo, la]);
  for (const p of props.points) b.extend([p.lon, p.lat]);
  if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 13, duration: 0 });
}

onMounted(() => {
  if (!el.value) return;
  const sources: StyleSpecification["sources"] = {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  };
  const layers: LayerSpecification[] = [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: { "raster-saturation": -0.8, "raster-opacity": 0.85 },
    },
  ];
  if (props.railway) {
    sources.orm = {
      type: "raster",
      tiles: ["https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "<a href='https://www.openrailwaymap.org/'>OpenRailwayMap</a> (CC BY-SA)",
      maxzoom: 19,
    };
    layers.push({ id: "orm", type: "raster", source: "orm", paint: { "raster-opacity": 0.6 } });
  }
  const m = new MlMap({
    container: el.value,
    style: { version: 8, sources, layers },
    center: [14.5, 47.6],
    zoom: 6.3,
    attributionControl: { compact: true },
  });
  map = m;
  ro = new ResizeObserver(() => m.resize());
  ro.observe(el.value);
  m.addControl(new NavigationControl({ showCompass: false }), "top-right");
  m.on("load", () => {
    const map = m;
    map.addSource("lines", { type: "geojson", data: lineData() });
    map.addSource("points", { type: "geojson", data: pointData() });
    map.addLayer({
      id: "lines-casing",
      type: "line",
      source: "lines",
      paint: { "line-color": "#000", "line-width": 6, "line-opacity": 0.35 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: "lines",
      type: "line",
      source: "lines",
      paint: { "line-color": ["get", "color"], "line-width": 4 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: "points",
      type: "circle",
      source: "points",
      paint: {
        "circle-radius": ["case", ["==", ["get", "big"], 1], 6, 4],
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#000",
        "circle-stroke-width": 1,
      },
    });
    map.on("click", "points", (e) => {
      const f = e.features?.[0];
      const id = f?.properties?.id;
      const label = f?.properties?.label;
      if (label && f?.geometry.type === "Point") {
        new Popup({ closeButton: false })
          .setLngLat(f.geometry.coordinates as [number, number])
          .setText(String(label))
          .addTo(map);
      }
      if (id) emit("clickPoint", String(id));
    });
    map.on("mouseenter", "points", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "points", () => (map.getCanvas().style.cursor = ""));
    fitAll();
    emit("ready", map);
  });
  m.on("moveend", () => emit("moveend", m));
});

watch(
  () => [props.lines, props.points],
  () => {
    (map?.getSource("lines") as GeoJSONSource | undefined)?.setData(lineData());
    (map?.getSource("points") as GeoJSONSource | undefined)?.setData(pointData());
  },
);
watch(() => props.lines, fitAll);

onBeforeUnmount(() => {
  ro?.disconnect();
  map?.remove();
});
</script>

<template>
  <div
    ref="el"
    class="w-full overflow-hidden rounded-md border border-[var(--line)]"
    :style="{ height }"
  />
</template>
