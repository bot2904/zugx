// Tooltips via the Popover API instead of `title` attributes / SVG <title>: styled like the app,
// shown on hover (with a short delay) and on keyboard focus, on touch by tapping non-interactive
// elements, dismissed with Esc. One shared popover element for the whole app.
//
//   <button v-tip="$t('bf.swap')">⇄</button>      <g v-tip="`${name}: ${n}`">…</g>
//   <g v-tip="{ title: 'Hauptsignal A12', lines: ['km 3.229', '100 km/h'] }">…</g>
//
// Accessibility: the text becomes the accessible name of controls without one (icon buttons),
// otherwise an accessible description — what the `title` attribute provided before.
import type { Directive } from "vue";

type El = HTMLElement | SVGElement;
/** plain text, or a bold title with detail lines */
export type TipContent = string | { title?: string; lines: (string | false | undefined)[] };
const TEXT = new WeakMap<El, TipContent>();

const plain = (c: TipContent) =>
  typeof c === "string" ? c : [c.title, ...c.lines].filter(Boolean).join(". ");

function render(t: HTMLElement, c: TipContent) {
  if (typeof c === "string") {
    t.textContent = c;
    return;
  }
  t.replaceChildren();
  if (c.title) {
    const b = document.createElement("strong");
    b.textContent = c.title;
    t.append(b);
  }
  for (const l of c.lines) {
    if (!l) continue;
    const d = document.createElement("div");
    d.textContent = l;
    t.append(d);
  }
}
const SHOW_DELAY = 400;

let tip: HTMLDivElement | undefined;
let owner: El | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function tipEl(): HTMLDivElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.id = "zugx-tip";
  tip.className = "tip";
  tip.setAttribute("role", "tooltip");
  // "hint" closes other hints only, never menus/dialogs; "manual" where hint is unsupported
  tip.setAttribute("popover", "hint");
  if (tip.popover !== "hint") tip.setAttribute("popover", "manual");
  document.body.append(tip);
  return tip;
}

function place(el: El) {
  const t = tipEl();
  const r = el.getBoundingClientRect();
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
  const below = r.bottom + 6 + h <= innerHeight - 4 || r.top - 6 - h < 4;
  t.style.left = `${Math.round(left)}px`;
  t.style.top = `${Math.round(below ? r.bottom + 6 : r.top - 6 - h)}px`;
}

function show(el: El) {
  const text = TEXT.get(el);
  if (!text) return;
  const t = tipEl();
  render(t, text);
  owner = el;
  if (!t.matches(":popover-open")) t.showPopover();
  place(el);
}

export function hideTip() {
  clearTimeout(timer);
  owner = undefined;
  if (tip?.matches(":popover-open")) tip.hidePopover();
}

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [tabindex], [role=button]";

function onEnter(e: PointerEvent) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget as El;
  clearTimeout(timer);
  // moving from one tooltip to the next: no delay
  timer = setTimeout(() => show(el), owner ? 0 : SHOW_DELAY);
}
function onLeave(e: PointerEvent) {
  if (e.pointerType !== "mouse") return;
  hideTip();
}
function onFocus(e: FocusEvent) {
  const el = e.currentTarget as El;
  if (el instanceof HTMLElement && !el.matches(":focus-visible")) return;
  show(el);
}
function onTap(e: PointerEvent) {
  if (e.pointerType === "mouse") return;
  const el = e.currentTarget as El;
  // touch: controls do their thing; plain elements (data points, labels) show their tip
  if ((e.target as Element).closest(INTERACTIVE)) return;
  if (owner === el) hideTip();
  else show(el);
}

let globalsBound = false;
function bindGlobals() {
  if (globalsBound) return;
  globalsBound = true;
  document.addEventListener("keydown", (e) => e.key === "Escape" && hideTip());
  addEventListener("scroll", hideTip, { capture: true, passive: true });
  addEventListener("resize", hideTip, { passive: true });
  // touch: a tap elsewhere closes it
  addEventListener("pointerdown", (e) => {
    if (owner && !(e.target instanceof Node && owner.contains(e.target))) hideTip();
  });
}

function label(el: El, content: TipContent) {
  const text = plain(content);
  // icon-only controls get the text as their name, everything else as a description
  const named =
    el.hasAttribute("aria-label") && el.getAttribute("data-tip-label") !== "1"
      ? true
      : (el.textContent ?? "").replace(/[\s⇄⇅‹›▲▼☰✕×⌁·]/g, "").length > 0;
  if (named) {
    el.setAttribute("aria-description", text);
  } else {
    el.setAttribute("aria-label", text);
    el.setAttribute("data-tip-label", "1");
  }
}

function update(el: El, text: TipContent | undefined) {
  if (!text) {
    TEXT.delete(el);
    el.removeAttribute("aria-description");
    if (owner === el) hideTip();
    return;
  }
  TEXT.set(el, text);
  label(el, text);
  if (owner === el && tip) {
    render(tip, text);
    place(el);
  }
}

export const vTip: Directive<El, TipContent | undefined> = {
  mounted(el, { value }) {
    bindGlobals();
    update(el, value);
    el.addEventListener("pointerenter", onEnter as EventListener);
    el.addEventListener("pointerleave", onLeave as EventListener);
    el.addEventListener("pointerup", onTap as EventListener);
    el.addEventListener("focusin", onFocus as EventListener);
    el.addEventListener("focusout", hideTip);
  },
  updated(el, { value, oldValue }) {
    if (value === oldValue) return;
    if (value && oldValue && typeof value === "object" && plain(value) === plain(oldValue)) return;
    update(el, value);
  },
  beforeUnmount(el) {
    if (owner === el) hideTip();
    TEXT.delete(el);
    el.removeEventListener("pointerenter", onEnter as EventListener);
    el.removeEventListener("pointerleave", onLeave as EventListener);
    el.removeEventListener("pointerup", onTap as EventListener);
    el.removeEventListener("focusin", onFocus as EventListener);
    el.removeEventListener("focusout", hideTip);
  },
};
