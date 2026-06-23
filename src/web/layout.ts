import type { Lang } from "./i18n.js";
import { t } from "./i18n.js";
import { helpButtonAndModal } from "./help.js";

export function layout(title: string, body: string, activeNav: string, lang: Lang, currentPath: string): string {
  const tr = t(lang);
  const otherLang: Lang = lang === "fr" ? "nl" : "fr";
  const switchUrl = `/lang/${otherLang}?next=${encodeURIComponent(currentPath)}`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Famimport</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }</style>
</head>
<body class="bg-slate-50 text-slate-900">
  <nav class="bg-white shadow-sm border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
      <a href="/" class="font-bold text-lg text-slate-800">Famimport</a>
      <a href="/" class="${navCls(activeNav, "dashboard")}">${escapeHtml(tr.navDashboard)}</a>
      <a href="/upload" class="${navCls(activeNav, "uploads")} ${activeNav === "uploads" ? "" : "bg-blue-600 text-white hover:bg-blue-700 hover:text-white px-3 py-1 rounded"}">${escapeHtml(tr.navUpload)}</a>
      <a href="/uploads" class="${navCls(activeNav, "uploads-list")}">${escapeHtml(tr.navHistory)}</a>
      <a href="/imports" class="${navCls(activeNav, "imports")}">${escapeHtml(tr.navImports)}</a>
      <a href="/products" class="${navCls(activeNav, "products")}">${escapeHtml(tr.navProducts)}</a>
      <a href="/codes" class="${navCls(activeNav, "codes")}">${escapeHtml(tr.navCodes)}</a>
      <div class="ml-auto flex items-center gap-2">
        ${helpButtonAndModal(lang)}
        <span class="text-xs text-slate-400">${lang === "fr" ? "FR" : "NL"}</span>
        <a href="${switchUrl}" class="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100" title="${lang === "fr" ? "Schakelen naar Nederlands" : "Passer en français"}">${otherLang.toUpperCase()}</a>
        <form method="POST" action="/logout" class="m-0"><button type="submit" class="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-600" title="${lang === "fr" ? "Se déconnecter" : "Uitloggen"}">${lang === "fr" ? "Déconnexion" : "Uitloggen"}</button></form>
      </div>
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
