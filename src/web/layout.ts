export function layout(title: string, body: string, activeNav: string = ""): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Famimport</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .badge { @apply inline-block px-2 py-0.5 text-xs rounded; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900">
  <nav class="bg-white shadow-sm border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
      <a href="/" class="font-bold text-lg text-slate-800">Famimport</a>
      <a href="/" class="${navCls(activeNav, "dashboard")}">Tableau de bord</a>
      <a href="/imports" class="${navCls(activeNav, "imports")}">Imports</a>
      <a href="/products" class="${navCls(activeNav, "products")}">Catalogue</a>
    </div>
  </nav>
  <main class="max-w-7xl mx-auto px-4 py-6">
    ${body}
  </main>
</body>
</html>`;
}

function navCls(active: string, name: string): string {
  const base = "text-sm transition-colors";
  return active === name
    ? `${base} text-slate-900 font-semibold`
    : `${base} text-slate-500 hover:text-slate-900`;
}

export function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatPct(n: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}
