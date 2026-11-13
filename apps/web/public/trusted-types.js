// Trusted Types "default" policy (CSP: require-trusted-types-for 'script'; trusted-types default vue).
// Only covers the few raw-string sinks used by dependencies:
// - script URLs: the service worker (/sw.js) and MapLibre's worker (/assets/*.mjs), same origin only
// - HTML: MapLibre parses attribution strings with DOMParser; reject anything script-like
if (window.trustedTypes && trustedTypes.createPolicy) {
  trustedTypes.createPolicy("default", {
    createScriptURL(url) {
      const u = new URL(url, location.href);
      if (u.origin === location.origin && /^\/(sw\.js|assets\/[\w.-]+\.m?js)$/.test(u.pathname))
        return u.href;
      throw new TypeError(`Trusted Types: blocked script URL ${url}`);
    },
    createHTML(html) {
      if (/<\s*script|\son\w+\s*=|javascript:/i.test(html))
        throw new TypeError("Trusted Types: blocked HTML");
      return html;
    },
  });
}
