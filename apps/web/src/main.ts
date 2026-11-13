// Entry: make sure Temporal exists before any app module evaluates. Browsers with native Temporal
// skip the polyfill chunk entirely; the others load it first. The app is imported dynamically
// *after* that, so no module of its graph runs without Temporal (a sibling static import would be
// evaluated before this top-level await settles). (modern-web-guidance: conditional-async-dependencies)
if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");
await import("./app.ts");

export {};
