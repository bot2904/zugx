// Apply a stored colour-scheme override before first paint (external, not inline: keeps the CSP strict).
try {
  const v = localStorage.getItem("zugx:color-scheme");
  if (v === "light" || v === "dark")
    document.querySelector('meta[name="color-scheme"]').content = v;
} catch {}
