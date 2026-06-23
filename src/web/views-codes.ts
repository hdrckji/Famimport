import { escapeHtml, layout } from "./layout.js";
import { t, type Lang } from "./i18n.js";
import type { TarabelCodeListResult, TarabelCodeDetail, ProductRow } from "./db.js";

function ratePct(r: number | null | undefined): string {
  if (r == null) return "—";
  return `${r.toFixed(1)}%`;
}

export function renderCodesList(filters: Record<string, string>, result: TarabelCodeListResult, page: number, limit: number, lang: Lang): string {
  const isFr = lang === "fr";
  const title = isFr ? "Codes Tarabel" : "Tarabel-codes";
  const subtitle = isFr
    ? "Catalogue des codes Tarabel rencontrés dans tes imports, avec description officielle (extraite des PDF douaniers) et taux de droits."
    : "Catalogus van Tarabel-codes uit je imports, met officiële beschrijving (uit douane-PDF's) en rechtenpercentages.";
  const totalPages = Math.ceil(result.total / limit);

  const rows = result.rows.map((c) => {
    const photo = c.sample_photo_path
      ? `<img src="/photo/${encodeURIComponent(c.sample_photo_path)}" class="w-10 h-10 object-cover rounded" loading="lazy">`
      : `<div class="w-10 h-10 bg-slate-100 rounded"></div>`;
    const customsBadge = c.customs_validated_count > 0
      ? `<span class="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-800">${c.customs_validated_count} ${isFr ? "douane" : "douane"}</span>`
      : "";
    const internalBadge = c.internal_estimate_count > 0
      ? `<span class="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-100 text-yellow-800">${c.internal_estimate_count} ${isFr ? "interne" : "intern"}</span>`
      : "";
    const desc = c.description ?? `<span class="text-slate-400 italic">${isFr ? "Pas de description officielle (jamais déclaré en douane)" : "Geen officiële beschrijving"}</span>`;
    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-2">${photo}</td>
      <td class="py-2 px-2"><a href="/codes/${c.code}" class="font-mono text-sm text-blue-600 hover:underline">${escapeHtml(c.code)}</a></td>
      <td class="py-2 px-2 text-sm">${desc}</td>
      <td class="py-2 px-2 text-xs text-right">${ratePct(c.duty_rate)}</td>
      <td class="py-2 px-2 text-xs text-right">${ratePct(c.vat_rate)}</td>
      <td class="py-2 px-2 text-xs">
        <div class="flex flex-col items-start gap-0.5">${customsBadge} ${internalBadge}</div>
      </td>
      <td class="py-2 px-2"><a href="/codes/${c.code}" class="text-blue-600 text-xs hover:underline">${isFr ? "détail" : "detail"}</a></td>
    </tr>`;
  }).join("");

  const buildQuery = (override: Record<string, string | number>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    for (const [k, v] of Object.entries(override)) params.set(k, String(v));
    return params.toString();
  };
  const prevPage = page > 1 ? `<a href="?${buildQuery({ page: page - 1 })}" class="text-blue-600 hover:underline">${isFr ? "← Précédent" : "← Vorige"}</a>` : "";
  const nextPage = page < totalPages ? `<a href="?${buildQuery({ page: page + 1 })}" class="text-blue-600 hover:underline">${isFr ? "Suivant →" : "Volgende →"}</a>` : "";

  const body = `
    <h1 class="text-2xl font-bold mb-1">${escapeHtml(title)} (${result.total.toLocaleString(isFr ? "fr-BE" : "nl-BE")})</h1>
    <p class="text-sm text-slate-600 mb-4">${escapeHtml(subtitle)}</p>
    <form class="bg-white rounded-lg border border-slate-200 p-3 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
      <input type="text" name="q" value="${escapeHtml(filters.q ?? "")}" placeholder="${isFr ? "Code, mot-clé description..." : "Code, omschrijving..."}" class="md:col-span-2 border border-slate-300 rounded px-3 py-1.5 text-sm">
      <select name="orderBy" class="border border-slate-300 rounded px-3 py-1.5 text-sm">
        <option value="uses"${filters.orderBy === "uses" || !filters.orderBy ? " selected" : ""}>${isFr ? "Trier par usage" : "Sorteer op gebruik"}</option>
        <option value="code"${filters.orderBy === "code" ? " selected" : ""}>${isFr ? "Trier par code" : "Sorteer op code"}</option>
      </select>
      <button type="submit" class="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700">${isFr ? "Filtrer" : "Filteren"}</button>
    </form>
    <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-2 text-left"></th>
            <th class="py-2 px-2 text-left">Code</th>
            <th class="py-2 px-2 text-left">${isFr ? "Description officielle" : "Officiële beschrijving"}</th>
            <th class="py-2 px-2 text-right">${isFr ? "Droits" : "Rechten"}</th>
            <th class="py-2 px-2 text-right">TVA</th>
            <th class="py-2 px-2 text-left">${isFr ? "Usage" : "Gebruik"}</th>
            <th class="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${result.total > 0 ? `<div class="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
        <div>${isFr ? "Page" : "Pagina"} ${page} / ${totalPages || 1}</div>
        <div class="flex gap-4">${prevPage}${nextPage}</div>
      </div>` : ""}
    </div>
  `;
  const currentQuery = (() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    if (page > 1) params.set("page", String(page));
    const s = params.toString();
    return s ? `/codes?${s}` : "/codes";
  })();
  return layout(title, body, "codes", lang, currentQuery);
}

export function renderCodeDetail(d: TarabelCodeDetail, lang: Lang): string {
  const tr = t(lang);
  const isFr = lang === "fr";

  const productThumbs = d.products.slice(0, 24).map((p: ProductRow) => {
    const photo = p.photo_path
      ? `<img src="/photo/${encodeURIComponent(p.photo_path)}" class="w-full h-24 object-cover rounded" loading="lazy">`
      : `<div class="w-full h-24 bg-slate-100 rounded"></div>`;
    const isCustoms = p.tarabel_source === "customs_pdf";
    return `
      <a href="/products/${p.id}" class="block bg-white border border-slate-200 rounded-lg p-2 hover:shadow-md transition">
        ${photo}
        <div class="text-xs font-medium text-slate-700 mt-1 truncate" title="${escapeHtml(p.english_description ?? "")}">${escapeHtml(p.english_description ?? p.chinese_description ?? "(no desc)")}</div>
        <div class="text-[10px] text-slate-500 truncate">${escapeHtml(p.folder_name)}</div>
        <div class="mt-1"><span class="inline-block px-1 py-0.5 text-[10px] rounded ${isCustoms ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}">${isCustoms ? (isFr ? "Douane" : "Douane") : (isFr ? "Interne" : "Intern")}</span></div>
      </a>`;
  }).join("");

  const declRows = d.declarations.slice(0, 30).map((decl) => `
    <tr class="border-b border-slate-100">
      <td class="py-2 px-3 text-sm"><a href="/imports/${decl.import_id}" class="text-blue-600 hover:underline">${escapeHtml(decl.folder_name)}</a></td>
      <td class="py-2 px-3 text-xs">#${decl.line_number}</td>
      <td class="py-2 px-3 text-xs text-slate-600">${escapeHtml((decl.description ?? "").slice(0, 80))}</td>
      <td class="py-2 px-3 text-xs text-right">${decl.net_mass != null ? `${decl.net_mass.toFixed(1)} kg` : "—"}</td>
      <td class="py-2 px-3 text-xs text-right">${decl.statistical_value != null ? `${decl.statistical_value.toFixed(2)} €` : "—"}</td>
    </tr>`).join("");

  const summary = (() => {
    if (d.customs_line_count > 0) {
      return `${isFr ? "Code rencontré dans" : "Code gevonden in"} <strong>${d.customs_line_count}</strong> ${isFr ? "déclarations douanières acceptées" : "geaccepteerde douaneaangiftes"}.`;
    }
    return `<span class="text-yellow-700">${isFr ? "⚠️ Ce code n'a jamais été déclaré officiellement en douane dans tes imports — uniquement estimé en interne." : "⚠️ Deze code is nooit officieel aangegeven in je imports — alleen intern geschat."}</span>`;
  })();

  const body = `
    <div class="mb-4">
      <a href="/codes" class="text-blue-600 text-sm hover:underline">${isFr ? "← Tous les codes" : "← Alle codes"}</a>
    </div>
    <div class="bg-white rounded-lg border border-slate-200 p-6 mb-6">
      <div class="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div class="text-xs uppercase text-slate-500 font-medium mb-1">${isFr ? "Code Tarabel" : "Tarabel-code"}</div>
          <div class="font-mono text-4xl font-bold text-slate-900">${escapeHtml(d.code)}</div>
          ${d.description
            ? `<h1 class="text-lg text-slate-800 mt-3 max-w-3xl">${escapeHtml(d.description)}</h1>`
            : `<div class="text-slate-400 italic mt-3">${isFr ? "Pas de description officielle disponible (code utilisé seulement en estimation interne)." : "Geen officiële beschrijving beschikbaar."}</div>`}
          ${d.alt_descriptions.length > 0 ? `
            <details class="mt-3 text-sm text-slate-600">
              <summary class="cursor-pointer">${isFr ? `${d.alt_descriptions.length} autre(s) formulation(s) rencontrée(s) dans les PDFs` : `${d.alt_descriptions.length} andere formulering(en)`}</summary>
              <ul class="list-disc list-inside mt-2 space-y-1">
                ${d.alt_descriptions.map((alt) => `<li class="text-xs">${escapeHtml(alt)}</li>`).join("")}
              </ul>
            </details>
          ` : ""}
        </div>
        <div class="flex flex-col gap-2 min-w-[200px]">
          <div class="bg-green-50 border border-green-200 rounded p-3">
            <div class="text-xs uppercase text-green-700 font-medium">${isFr ? "Droits d'invoer" : "Rechten"}</div>
            <div class="text-2xl font-bold text-green-800">${ratePct(d.duty_rate)}</div>
          </div>
          <div class="bg-slate-50 border border-slate-200 rounded p-3">
            <div class="text-xs uppercase text-slate-700 font-medium">TVA</div>
            <div class="text-2xl font-bold text-slate-800">${ratePct(d.vat_rate)}</div>
          </div>
        </div>
      </div>
      <div class="mt-4 pt-4 border-t border-slate-200 text-sm text-slate-700">${summary}</div>
      <div class="mt-3 flex gap-3 flex-wrap text-sm">
        <span class="inline-block px-2 py-0.5 rounded bg-green-100 text-green-800">${d.customs_validated_count} ${isFr ? "produits validés douane" : "producten gevalideerd"}</span>
        <span class="inline-block px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">${d.internal_estimate_count} ${isFr ? "produits estimés interne" : "intern geschat"}</span>
        <span class="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800">${d.product_count} ${isFr ? "produits au total" : "totaal producten"}</span>
      </div>
    </div>

    ${d.products.length > 0 ? `
      <div class="mb-6">
        <h2 class="font-semibold mb-3">${isFr ? "Produits classés sous ce code" : "Producten onder deze code"} (${d.products.length}${d.products.length > 24 ? `, ${isFr ? "24 premiers affichés" : "24 weergegeven"}` : ""})</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          ${productThumbs}
        </div>
      </div>
    ` : ""}

    ${d.declarations.length > 0 ? `
      <div class="mb-6">
        <h2 class="font-semibold mb-3">${isFr ? "Déclarations douanières où ce code apparaît" : "Aangiftes met deze code"} (${d.declarations.length})</h2>
        <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table class="w-full">
            <thead class="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th class="py-2 px-3 text-left">${escapeHtml(tr.import)}</th>
                <th class="py-2 px-3 text-left">${isFr ? "Ligne" : "Regel"}</th>
                <th class="py-2 px-3 text-left">${isFr ? "Description (PDF)" : "Beschrijving (PDF)"}</th>
                <th class="py-2 px-3 text-right">${isFr ? "Masse nette" : "Nettomassa"}</th>
                <th class="py-2 px-3 text-right">${isFr ? "Valeur stat." : "Statistische waarde"}</th>
              </tr>
            </thead>
            <tbody>${declRows}</tbody>
          </table>
        </div>
      </div>
    ` : ""}
  `;

  return layout(d.code, body, "codes", lang, `/codes/${d.code}`);
}
