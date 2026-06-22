import { escapeHtml, layout } from "./layout.js";
import { translateMaterial, t, type Lang } from "./i18n.js";
import type { UploadRow, UploadSummary } from "./upload.js";

function materialCell(raw: string | null, lang: Lang): string {
  if (!raw) return "";
  const translated = translateMaterial(raw, lang);
  if (!translated || translated === raw) return escapeHtml(raw);
  return `<span>${escapeHtml(translated)}</span> <span class="text-xs text-slate-400">(${escapeHtml(raw)})</span>`;
}

export function renderUploadList(uploads: UploadSummary[], lang: Lang): string {
  const tr = t(lang);
  const rows = uploads.map((u) => {
    const total = u.total_rows;
    const matched = u.matched_ean + u.matched_desc;
    const cov = total ? Math.round((matched / total) * 100) : 0;
    const covColor = cov >= 60 ? "bg-green-100 text-green-800" : cov >= 20 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-3"><a href="/uploads/${u.id}" class="text-blue-600 hover:underline font-medium">${escapeHtml(u.original_name)}</a></td>
      <td class="py-2 px-3 text-sm">${escapeHtml(u.uploaded_at)}</td>
      <td class="py-2 px-3 text-sm">${escapeHtml(u.status)}</td>
      <td class="py-2 px-3 text-right text-sm">${total}</td>
      <td class="py-2 px-3"><span class="inline-block px-2 py-0.5 text-xs rounded ${covColor}">${matched}/${total} (${cov}%)</span></td>
      <td class="py-2 px-3 text-sm"><a href="/uploads/${u.id}/export" class="text-blue-600 hover:underline">Excel</a></td>
    </tr>`;
  }).join("");

  const body = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">${lang === "fr" ? "Imports en cours / récents" : "Lopende / recente imports"}</h1>
      <a href="/upload" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">+ ${lang === "fr" ? "Nouvel import" : "Nieuwe import"}</a>
    </div>
    ${uploads.length === 0 ? `<div class="bg-white border border-dashed border-slate-300 rounded-lg p-12 text-center text-slate-500">
      ${lang === "fr" ? "Aucun fichier importé pour l'instant." : "Nog geen bestand geïmporteerd."}<br>
      <a href="/upload" class="text-blue-600 hover:underline">${lang === "fr" ? "Importer un Excel maintenant" : "Nu een Excel importeren"} →</a>
    </div>` : `
      <div class="bg-white rounded-lg border border-slate-200">
        <table class="w-full">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th class="py-2 px-3 text-left">${lang === "fr" ? "Fichier" : "Bestand"}</th>
              <th class="py-2 px-3 text-left">${lang === "fr" ? "Date" : "Datum"}</th>
              <th class="py-2 px-3 text-left">Status</th>
              <th class="py-2 px-3 text-right">${escapeHtml(tr.products)}</th>
              <th class="py-2 px-3 text-left">${lang === "fr" ? "Auto-classifiés" : "Automatisch geclassificeerd"}</th>
              <th class="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `}
  `;
  return layout(lang === "fr" ? "Imports" : "Imports", body, "uploads", lang, "/uploads");
}

export function renderUploadForm(lang: Lang, error?: string): string {
  const body = `
    <h1 class="text-2xl font-bold mb-4">${lang === "fr" ? "Nouvel import" : "Nieuwe import"}</h1>
    ${error ? `<div class="bg-red-50 border border-red-200 text-red-800 rounded p-3 mb-4 text-sm">${escapeHtml(error)}</div>` : ""}
    <div class="bg-white rounded-lg border border-slate-200 p-6">
      <p class="text-sm text-slate-600 mb-4">
        ${lang === "fr"
          ? "Dépose un packing list Excel (.xlsx) du fournisseur. L'app va lire l'onglet bewerkt/creatie, chercher chaque produit dans le catalogue historique (par EAN puis description), et te proposer un code Tarabel."
          : "Sleep een packing list Excel (.xlsx) van de leverancier hierheen. De app leest het bewerkt/creatie-tabblad, zoekt elk product in de historische catalogus (op EAN dan omschrijving), en stelt een Tarabel-code voor."}
      </p>
      <form action="/upload" method="POST" enctype="multipart/form-data" class="space-y-4">
        <input type="file" name="file" accept=".xlsx" required class="block w-full text-sm border border-slate-300 rounded p-2">
        <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded text-sm font-medium hover:bg-blue-700">
          ${lang === "fr" ? "Lancer le traitement" : "Verwerking starten"}
        </button>
      </form>
    </div>
  `;
  return layout(lang === "fr" ? "Nouvel import" : "Nieuwe import", body, "uploads", lang, "/upload");
}

export function renderUploadDetail(upload: UploadSummary, rows: UploadRow[], lang: Lang): string {
  const tr = t(lang);
  const total = rows.length;
  const counts = {
    high: rows.filter((r) => r.suggestion_confidence === "high").length,
    medium: rows.filter((r) => r.suggestion_confidence === "medium").length,
    low: rows.filter((r) => r.suggestion_confidence === "low").length,
    none: rows.filter((r) => !r.suggestion_confidence || r.suggestion_confidence === "none").length,
  };

  const rowsHtml = rows.map((r) => {
    const photo = r.photo_path
      ? `<img src="/upload-photo/${encodeURIComponent(r.photo_path)}" class="w-12 h-12 object-cover rounded" loading="lazy">`
      : `<div class="w-12 h-12 bg-slate-100 rounded"></div>`;
    const divergent = r.hs_china && r.suggested_code && r.hs_china !== r.suggested_code;
    const codeBadge = r.suggested_code
      ? `<span class="font-mono text-xs px-1.5 py-0.5 rounded ${
          r.suggestion_confidence === "high" ? "bg-green-100 text-green-800"
          : r.suggestion_confidence === "medium" ? "bg-yellow-100 text-yellow-800"
          : "bg-red-100 text-red-800"
        }">${escapeHtml(r.suggested_code)}</span>`
      : `<span class="text-xs text-slate-400">${lang === "fr" ? "à classer" : "te classificeren"}</span>`;
    return `
      <tr class="border-b border-slate-100">
        <td class="py-2 px-2">${photo}</td>
        <td class="py-2 px-2 text-sm">${escapeHtml(r.english_description ?? "")}<div class="text-xs text-slate-500">${escapeHtml(r.chinese_description ?? "")}</div></td>
        <td class="py-2 px-2 text-xs font-mono">${escapeHtml(r.ean ?? "—")}</td>
        <td class="py-2 px-2 text-xs">${materialCell(r.material, lang)}</td>
        <td class="py-2 px-2 text-xs font-mono ${divergent ? "text-red-600 font-bold" : ""}">${escapeHtml(r.hs_china ?? "—")}</td>
        <td class="py-2 px-2">${codeBadge}</td>
        <td class="py-2 px-2 text-xs text-right">${r.suggested_invoer_pct != null ? (r.suggested_invoer_pct * 100).toFixed(1) + "%" : ""}</td>
        <td class="py-2 px-2 text-xs text-slate-500 max-w-xs">${escapeHtml(r.suggestion_note ?? "")}</td>
      </tr>`;
  }).join("");

  const body = `
    <div class="mb-4 flex items-center gap-3">
      <a href="/uploads" class="text-blue-600 text-sm hover:underline">${lang === "fr" ? "← Imports" : "← Imports"}</a>
      <h1 class="text-2xl font-bold">${escapeHtml(upload.original_name)}</h1>
      <a href="/uploads/${upload.id}/export" class="ml-auto bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
        ${lang === "fr" ? "⬇ Télécharger Excel enrichi" : "⬇ Verrijkte Excel downloaden"}
      </a>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white border border-slate-200 rounded p-3">
        <div class="text-xs uppercase text-slate-500">${lang === "fr" ? "Total" : "Totaal"}</div>
        <div class="text-2xl font-bold">${total}</div>
      </div>
      <div class="bg-green-50 border border-green-200 rounded p-3">
        <div class="text-xs uppercase text-green-700">${lang === "fr" ? "Confiance haute" : "Hoog vertrouwen"}</div>
        <div class="text-2xl font-bold text-green-800">${counts.high}</div>
      </div>
      <div class="bg-yellow-50 border border-yellow-200 rounded p-3">
        <div class="text-xs uppercase text-yellow-700">${lang === "fr" ? "Confiance moyenne" : "Middelmatig"}</div>
        <div class="text-2xl font-bold text-yellow-800">${counts.medium}</div>
      </div>
      <div class="bg-red-50 border border-red-200 rounded p-3">
        <div class="text-xs uppercase text-red-700">${lang === "fr" ? "À revoir / nouveau" : "Te bekijken / nieuw"}</div>
        <div class="text-2xl font-bold text-red-800">${counts.low + counts.none}</div>
      </div>
    </div>
    <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-2 text-left">Photo</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.description)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.ean)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.material)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.hsChina)}</th>
            <th class="py-2 px-2 text-left">${lang === "fr" ? "Suggestion" : "Voorstel"}</th>
            <th class="py-2 px-2 text-right">${escapeHtml(tr.invoer)}</th>
            <th class="py-2 px-2 text-left">Note</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
  return layout(upload.original_name, body, "uploads", lang, `/uploads/${upload.id}`);
}
