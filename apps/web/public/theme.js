// Apply the saved / preferred theme before first paint (external file: keeps the CSP free of inline scripts).
try {
  const t = localStorage.getItem("zugx:theme");
  if (t) document.documentElement.dataset.theme = t;
  else if (matchMedia("(prefers-color-scheme: light)").matches)
    document.documentElement.dataset.theme = "light";
} catch {}
