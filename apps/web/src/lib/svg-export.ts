// Standalone SVG export of a rendered chart (e.g. the VzG-Grafik for Wikimedia Commons): the
// app's CSS is not available there, so colours and fonts are inlined — resolved in light mode —,
// interactive-only parts (hover targets, ARIA tooltips) dropped, and a caption and a footer with
// the data sources added. Fonts: those Commons' SVG renderer (librsvg) has (see SANS/MONO).

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "stroke-linejoin",
  "opacity",
  "font-size",
  "font-weight",
] as const;
// font lists as recommended by Wikimedia Commons (Help:SVG#Fonts): Liberation fonts are installed
// on its renderer and metric-compatible with Arial / Courier New; generic family last
const SANS = "Liberation Sans, Arial, Nimbus Sans L, Helvetica, sans-serif";
const MONO = "Liberation Mono, Courier New, Courier, monospace";
const NS = "http://www.w3.org/2000/svg";

export interface SvgExport {
  /** first line above the chart (bold) */
  caption: string;
  /** second line above the chart */
  subtitle?: string;
  /** lines below the chart: legend, data sources, link back */
  footer: string[];
  /** document title / description (metadata) */
  title: string;
  description?: string;
}

/**
 * The theme's light values: `--x: light-dark(light, dark)` (dev) or, transpiled by Lightning CSS,
 * `--x: var(--lightningcss-light, light) var(--lightningcss-dark, dark)` (build). Set on the
 * export container, they make everything inside render light — the export is always light
 * (Commons pages are white), whatever the app currently shows.
 */
function lightTheme(): [string, string][] {
  const out: [string, string][] = [];
  const pair =
    /^\s*(?:light-dark\(\s*([^,]+?)\s*,|var\(\s*--lightningcss-light\s*,\s*([^)]+?)\s*\))/;
  const visit = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule)
        for (const prop of r.style) {
          if (!prop.startsWith("--") || prop.startsWith("--lightningcss")) continue;
          const m = pair.exec(r.style.getPropertyValue(prop));
          if (m) out.push([prop, (m[1] ?? m[2])!]);
        }
      if ("cssRules" in r && (r as CSSGroupingRule).cssRules?.length)
        visit((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // cross-origin sheet: not ours
    }
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** the chart as a standalone SVG document (string) */
export function standaloneSvg(svg: SVGSVGElement, o: SvgExport): string {
  const [, , w, h] = (svg.getAttribute("viewBox") ?? `0 0 ${svg.clientWidth} ${svg.clientHeight}`)
    .split(/\s+/)
    .map(Number) as [number, number, number, number];
  // resolve the styles on a copy inside a light-themed container
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;color-scheme:light;";
  for (const [prop, value] of lightTheme()) host.style.setProperty(prop, value);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  host.append(clone);
  document.body.append(host);
  try {
    // hover targets (transparent rectangles) are of no use in a static image
    for (const el of clone.querySelectorAll<SVGElement>("rect, path"))
      if (getComputedStyle(el).fill === "transparent" || el.getAttribute("fill") === "transparent")
        if (el.tagName === "rect") el.remove();
    // first resolve every element's style (the selectors need the classes), then strip
    const all = [clone, ...clone.querySelectorAll<SVGElement>("*")];
    const styles = all.map((el) => {
      const cs = getComputedStyle(el);
      const style = STYLE_PROPS.map((p) => [p, cs.getPropertyValue(p)] as const)
        .filter(([, v]) => v && v !== "normal")
        .map(([p, v]) => `${p}:${v}`);
      if (el.tagName === "text" || el.tagName === "g")
        style.push(`font-family:${/mono/i.test(cs.fontFamily) ? MONO : SANS}`);
      return style.join(";");
    });
    all.forEach((el, i) => {
      for (const a of [...el.attributes])
        if (
          a.name === "class" ||
          a.name === "role" ||
          a.name.startsWith("aria-") ||
          a.name.startsWith("data-") ||
          a.name === "href" || // app links (e.g. to other lines' charts) mean nothing on Commons
          a.value.includes("var(") // app CSS variables: resolved into the style attribute
        )
          el.removeAttribute(a.name);
      el.setAttribute("style", styles[i]!);
    });
    const head = 56;
    const lineH = 16;
    const foot = 16 + o.footer.length * lineH;
    const W = w;
    const H = head + h + foot;
    const text = (x: number, y: number, s: string, extra = "") =>
      `<text x="${x}" y="${y}" style="font-family:${SANS};${extra}">${esc(s)}</text>`;
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<title>${esc(o.title)}</title>`,
      o.description ? `<desc>${esc(o.description)}</desc>` : "",
      `<rect width="${W}" height="${H}" style="fill:#ffffff"/>`,
      text(8, 22, o.caption, "font-size:15px;font-weight:700;fill:#16181c"),
      o.subtitle ? text(8, 42, o.subtitle, "font-size:11px;fill:#4a5058") : "",
      `<g transform="translate(0 ${head})">${clone.innerHTML}</g>`,
      ...o.footer.map((l, i) =>
        text(8, head + h + 14 + i * lineH, l, "font-size:10px;fill:#4a5058"),
      ),
      `</svg>`,
    ]
      .filter(Boolean)
      .join("\n");
  } finally {
    host.remove();
  }
}

/** offer a string as a file download */
export function download(content: string, filename: string, type = "image/svg+xml") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
