import { escapeHtml, formatPct, layout } from "./layout.js";
import { t, translateMaterial, type Lang } from "./i18n.js";
import type { DashboardStats, ImportRow, ProductRow, SearchResult, TopCode } from "./db.js";

function materialCell(raw: string | null, lang: Lang): string {
  if (!raw) return "";
  const translated = translateMaterial(raw, lang);
  if (!translated || translated === raw) return escapeHtml(raw);
  return `<span>${escapeHtml(translated)}</span> <span class="text-xs text-slate-400" title="${escapeHtml(raw)}">(${escapeHtml(raw)})</span>`;
}

export function renderDashboard(
  stats: DashboardStats,
  recentImports: ImportRow[],
  topCodes: TopCode[],
  lang: Lang,
): string {
  const tr = t(lang);
  const customsPct = formatPct(stats.productsCustomsValidated, stats.totalProducts);
  const internalPct = formatPct(stats.productsInternalEstimate, stats.totalProducts);
  const eanPct = formatPct(stats.productsWithEan, stats.totalProducts);

  const card = (
    label: string,
    value: string,
    sub: string,
    accent: "" | "green" | "yellow" = "",
  ): string => {
    const accentClasses =
      accent === "green"
        ? "border-green-200 bg-green-50"
        : accent === "yellow"
          ? "border-yellow-200 bg-yellow-50"
          : "border-slate-200 bg-white";
    const valueColor =
      accent === "green" ? "text-green-800" : accent === "yellow" ? "text-yellow-800" : "text-slate-900";
    return `
      <div class="rounded-lg border ${accentClasses} p-4">
        <div class="text-xs uppercase text-slate-500 font-medium">${escapeHtml(label)}</div>
        <div class="text-3xl font-bold ${valueColor} mt-1">${escapeHtml(value)}</div>
        <div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>
      </div>`;
  };

  const cardsHtml = [
    card(tr.cardImports, stats.totalImports.toString(), tr.cardImportsSub),
    card(tr.cardProducts, stats.totalProducts.toLocaleString(lang === "fr" ? "fr-BE" : "nl-BE"), `${eanPct} ${tr.cardProductsSubWithEan}`),
    card(tr.cardCustomsValidated, `${stats.productsCustomsValidated.toLocaleString(lang === "fr" ? "fr-BE" : "nl-BE")} (${customsPct})`, tr.cardCustomsValidatedSub, "green"),
    card(tr.cardInternalEstimate, `${stats.productsInternalEstimate.toLocaleString(lang === "fr" ? "fr-BE" : "nl-BE")} (${internalPct})`, tr.cardInternalEstimateSub, "yellow"),
    card(tr.cardUniqueCodes, stats.uniqueCustomsCodes.toString(), tr.cardUniqueCodesSub),
    card(tr.cardDeclarations, stats.totalDeclarations.toString(), `${stats.totalCustomsLines} ${tr.cardDeclarationsSub}`),
    card(tr.cardUniqueEans, stats.uniqueEans.toString(), `${stats.productsWithEan - stats.uniqueEans} ${tr.cardUniqueEansSub}`),
    card(tr.cardDivergence, `${stats.divergencePct}%`, tr.cardDivergenceSub),
  ].join("");

  const importsRows = recentImports.slice(0, 8).map((i) => `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-3"><a href="/imports/${i.id}" class="text-blue-600 hover:underline">${escapeHtml(i.folder_name)}</a></td>
      <td class="py-2 px-3 text-sm">${i.year ?? ""}</td>
      <td class="py-2 px-3 text-sm">${escapeHtml(i.brand ?? "")}</td>
      <td class="py-2 px-3 text-right text-sm">${i.product_count}</td>
      <td class="py-2 px-3 text-right text-sm text-green-700 font-medium">${i.customs_validated_count}</td>
      <td class="py-2 px-3 text-right text-sm text-yellow-700">${i.internal_estimate_count}</td>
    </tr>`).join("");

  const codesRows = topCodes.map((c) => `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-1.5 px-3 font-mono text-sm"><a href="/codes/${c.code}" class="text-blue-600 hover:underline">${escapeHtml(c.code)}</a></td>
      <td class="py-1.5 px-3 text-right text-sm">${c.uses}</td>
    </tr>`).join("");

  const body = `
    <h1 class="text-2xl font-bold mb-4">${escapeHtml(tr.dashboardTitle)}</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">${cardsHtml}</div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-white rounded-lg border border-slate-200">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 class="font-semibold">${escapeHtml(tr.recentImports)}</h2>
          <a href="/imports" class="text-sm text-blue-600 hover:underline">${escapeHtml(tr.seeAll)}</a>
        </div>
        <table class="w-full">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th class="py-2 px-3 text-left">${escapeHtml(tr.folder)}</th>
              <th class="py-2 px-3 text-left">${escapeHtml(tr.year)}</th>
              <th class="py-2 px-3 text-left">${escapeHtml(tr.brand)}</th>
              <th class="py-2 px-3 text-right">${escapeHtml(tr.products)}</th>
              <th class="py-2 px-3 text-right text-green-700" title="${escapeHtml(tr.cardCustomsValidatedSub)}">${escapeHtml(tr.customsValidated)}</th>
              <th class="py-2 px-3 text-right text-yellow-700" title="${escapeHtml(tr.cardInternalEstimateSub)}">${escapeHtml(tr.internalEstimate)}</th>
            </tr>
          </thead>
          <tbody>${importsRows}</tbody>
        </table>
      </div>
      <div class="bg-white rounded-lg border border-slate-200">
        <div class="px-4 py-3 border-b border-slate-200">
          <h2 class="font-semibold">${escapeHtml(tr.topCodes)}</h2>
          <div class="text-xs text-slate-500 mt-0.5">${lang === "fr" ? "uniquement codes validés douane" : "alleen door douane gevalideerde codes"}</div>
        </div>
        <table class="w-full">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th class="py-2 px-3 text-left">Code</th><th class="py-2 px-3 text-right">${escapeHtml(tr.uses)}</th></tr>
          </thead>
          <tbody>${codesRows}</tbody>
        </table>
      </div>
    </div>
  `;
  return layout(tr.dashboardTitle, body, "dashboard", lang, "/");
}

function coverageCell(count: number, total: number, color: "green" | "yellow"): string {
  if (total === 0) return `<span class="text-slate-400 text-xs">—</span>`;
  const pct = Math.round((count / total) * 100);
  const fgClass = color === "green" ? "text-green-800" : "text-yellow-800";
  const barClass = color === "green" ? "bg-green-500" : "bg-yellow-400";
  return `
    <div class="flex items-center gap-2">
      <div class="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div class="${barClass} h-full" style="width: ${pct}%"></div>
      </div>
      <span class="text-xs font-medium ${fgClass} whitespace-nowrap">${count} (${pct}%)</span>
    </div>`;
}

export function renderImports(imports: ImportRow[], lang: Lang): string {
  const tr = t(lang);
  const rows = imports.map((i) => {
    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-3"><a href="/imports/${i.id}" class="text-blue-600 hover:underline font-medium">${escapeHtml(i.folder_name)}</a></td>
      <td class="py-2 px-3 text-sm">${i.year ?? ""}</td>
      <td class="py-2 px-3 text-sm">${escapeHtml(i.brand ?? "")}</td>
      <td class="py-2 px-3 text-right text-sm">${i.product_count}</td>
      <td class="py-2 px-3">${coverageCell(i.customs_validated_count, i.product_count, "green")}</td>
      <td class="py-2 px-3">${coverageCell(i.internal_estimate_count, i.product_count, "yellow")}</td>
      <td class="py-2 px-3 text-sm">${i.declaration_count > 0 ? "✓" : "—"}</td>
    </tr>`;
  }).join("");

  const body = `
    <h1 class="text-2xl font-bold mb-4">${escapeHtml(tr.importsTitle)} (${imports.length})</h1>
    <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-3 text-left">${escapeHtml(tr.folder)}</th>
            <th class="py-2 px-3 text-left">${escapeHtml(tr.year)}</th>
            <th class="py-2 px-3 text-left">${escapeHtml(tr.brand)}</th>
            <th class="py-2 px-3 text-right">${escapeHtml(tr.products)}</th>
            <th class="py-2 px-3 text-left text-green-700" title="${escapeHtml(tr.cardCustomsValidatedSub)}">${escapeHtml(tr.customsValidated)}</th>
            <th class="py-2 px-3 text-left text-yellow-700" title="${escapeHtml(tr.cardInternalEstimateSub)}">${escapeHtml(tr.internalEstimate)}</th>
            <th class="py-2 px-3 text-left">${escapeHtml(tr.customsPdf)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  return layout(tr.importsTitle, body, "imports", lang, "/imports");
}

export function renderImportDetail(imp: ImportRow, products: ProductRow[], lang: Lang): string {
  const tr = t(lang);
  const rows = products.map((p) => {
    const photo = p.photo_path
      ? `<img src="/photo/${encodeURIComponent(p.photo_path)}" class="w-12 h-12 object-cover rounded" loading="lazy">`
      : `<div class="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">—</div>`;
    const isCustoms = p.tarabel_source === "customs_pdf";
    const tarabelCell = p.tarabel_validated
      ? `<a href="/codes/${p.tarabel_validated}" class="font-mono text-sm text-blue-600 hover:underline">${escapeHtml(p.tarabel_validated)}</a>
         <span class="inline-block ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${isCustoms ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}" title="${escapeHtml(isCustoms ? tr.cardCustomsValidatedSub : tr.cardInternalEstimateSub)}">${escapeHtml(isCustoms ? tr.badgeCustomsValidated : tr.badgeInternalEstimate)}</span>`
      : `<span class="text-slate-400 text-xs">—</span>`;
    const divergent = p.hs_china && p.tarabel_validated && p.hs_china !== p.tarabel_validated;
    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-2">${photo}</td>
      <td class="py-2 px-2 text-sm">${escapeHtml(p.english_description ?? "")}</td>
      <td class="py-2 px-2 text-xs font-mono">${escapeHtml(p.ean ?? "—")}</td>
      <td class="py-2 px-2 text-xs">${materialCell(p.material, lang)}</td>
      <td class="py-2 px-2 text-xs font-mono ${divergent ? "text-red-600 font-bold" : ""}">${escapeHtml(p.hs_china ?? "—")}</td>
      <td class="py-2 px-2">${tarabelCell}</td>
      <td class="py-2 px-2 text-xs text-right">${p.invoer_pct != null ? (p.invoer_pct * 100).toFixed(1) + "%" : ""}</td>
      <td class="py-2 px-2 text-xs text-right">${p.price_usd ?? ""}</td>
      <td class="py-2 px-2"><a href="/products/${p.id}" class="text-blue-600 text-xs hover:underline">${escapeHtml(tr.detail)}</a></td>
    </tr>`;
  }).join("");
  const customsPct = imp.product_count ? Math.round((imp.customs_validated_count / imp.product_count) * 100) : 0;
  const internalPct = imp.product_count ? Math.round((imp.internal_estimate_count / imp.product_count) * 100) : 0;
  const body = `
    <div class="mb-4 flex items-center gap-3 flex-wrap">
      <a href="/imports" class="text-blue-600 text-sm hover:underline">${escapeHtml(tr.backToImports)}</a>
      <h1 class="text-2xl font-bold">${escapeHtml(imp.folder_name)}</h1>
      <span class="text-sm text-slate-500">${imp.year} · ${escapeHtml(imp.brand ?? "")} · ${imp.product_count} ${escapeHtml(tr.importDetailHint)} · ${escapeHtml(tr.sheet)} "${escapeHtml(imp.schema_variant ?? "")}"</span>
      <span class="inline-block px-2 py-0.5 text-xs rounded bg-green-100 text-green-800 ml-2">${imp.customs_validated_count} ${escapeHtml(tr.customsValidated.toLowerCase())} (${customsPct}%)</span>
      <span class="inline-block px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">${imp.internal_estimate_count} ${escapeHtml(tr.internalEstimate.toLowerCase())} (${internalPct}%)</span>
    </div>
    <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-2 text-left">Photo</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.description)} EN</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.ean)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.material)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.hsChina)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.tarabel)}</th>
            <th class="py-2 px-2 text-right">${escapeHtml(tr.invoer)}</th>
            <th class="py-2 px-2 text-right">${escapeHtml(tr.priceUsd)}</th>
            <th class="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  return layout(imp.folder_name, body, "imports", lang, `/imports/${imp.id}`);
}

export function renderProductsSearch(filters: Record<string, string>, results: SearchResult, page: number, limit: number, lang: Lang): string {
  const tr = t(lang);
  const totalPages = Math.ceil(results.total / limit);
  const rows = results.rows.map((p) => {
    const photo = p.photo_path
      ? `<img src="/photo/${encodeURIComponent(p.photo_path)}" class="w-16 h-16 object-cover rounded" loading="lazy">`
      : `<div class="w-16 h-16 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">—</div>`;
    const isCustoms = p.tarabel_source === "customs_pdf";
    const tarabel = p.tarabel_validated
      ? `<a href="/codes/${p.tarabel_validated}" class="font-mono text-xs px-1.5 py-0.5 rounded ${isCustoms ? "bg-green-50 text-green-800 hover:bg-green-100" : "bg-yellow-50 text-yellow-800 hover:bg-yellow-100"}" title="${escapeHtml(isCustoms ? tr.cardCustomsValidatedSub : tr.cardInternalEstimateSub)}">${escapeHtml(p.tarabel_validated)}</a>`
      : `<span class="text-slate-400 text-xs">—</span>`;
    return `
    <tr class="border-b border-slate-100">
      <td class="py-2 px-2">${photo}</td>
      <td class="py-2 px-2 text-sm">
        <div>${escapeHtml(p.english_description ?? "")}</div>
        <div class="text-xs text-slate-500">${escapeHtml(p.chinese_description ?? "")}</div>
        ${lang === "fr" && p.fr_description ? `<div class="text-xs text-slate-500">${escapeHtml(p.fr_description)}</div>` : ""}
        ${lang === "nl" && p.nl_description ? `<div class="text-xs text-slate-500">${escapeHtml(p.nl_description)}</div>` : ""}
      </td>
      <td class="py-2 px-2 text-xs font-mono">${escapeHtml(p.ean ?? "—")}</td>
      <td class="py-2 px-2 text-xs">${materialCell(p.material, lang)}</td>
      <td class="py-2 px-2 text-xs font-mono">${escapeHtml(p.hs_china ?? "—")}</td>
      <td class="py-2 px-2">${tarabel}</td>
      <td class="py-2 px-2 text-xs"><a href="/imports/${p.import_id}" class="text-blue-600 hover:underline">${escapeHtml(p.folder_name)}</a></td>
      <td class="py-2 px-2"><a href="/products/${p.id}" class="text-blue-600 text-xs hover:underline">${escapeHtml(tr.detail)}</a></td>
    </tr>`;
  }).join("");

  const buildQuery = (override: Record<string, string | number>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    for (const [k, v] of Object.entries(override)) params.set(k, String(v));
    return params.toString();
  };
  const prevPage = page > 1 ? `<a href="?${buildQuery({ page: page - 1 })}" class="text-blue-600 hover:underline">${escapeHtml(tr.previous)}</a>` : "";
  const nextPage = page < totalPages ? `<a href="?${buildQuery({ page: page + 1 })}" class="text-blue-600 hover:underline">${escapeHtml(tr.next)}</a>` : "";

  const currentQuery = (() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    if (page > 1) params.set("page", String(page));
    const s = params.toString();
    return s ? `/products?${s}` : "/products";
  })();

  const body = `
    <h1 class="text-2xl font-bold mb-4">${escapeHtml(tr.catalogTitle)} (${results.total.toLocaleString(lang === "fr" ? "fr-BE" : "nl-BE")} ${escapeHtml(tr.productsCount)})</h1>
    <form class="bg-white rounded-lg border border-slate-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
      <input type="text" name="q" value="${escapeHtml(filters.q ?? "")}" placeholder="${escapeHtml(tr.searchPlaceholder)}" class="border border-slate-300 rounded px-3 py-1.5 text-sm md:col-span-2">
      <input type="text" name="ean" value="${escapeHtml(filters.ean ?? "")}" placeholder="${escapeHtml(tr.eanPlaceholder)}" class="border border-slate-300 rounded px-3 py-1.5 text-sm font-mono">
      <input type="text" name="hsCode" value="${escapeHtml(filters.hsCode ?? "")}" placeholder="${escapeHtml(tr.hsCodePlaceholder)}" class="border border-slate-300 rounded px-3 py-1.5 text-sm font-mono">
      <select name="brand" class="border border-slate-300 rounded px-3 py-1.5 text-sm">
        <option value="">${escapeHtml(tr.allBrands)}</option>
        <option value="FAMI"${filters.brand === "FAMI" ? " selected" : ""}>FAMI</option>
        <option value="TROPI"${filters.brand === "TROPI" ? " selected" : ""}>TROPI</option>
      </select>
      <select name="year" class="border border-slate-300 rounded px-3 py-1.5 text-sm">
        <option value="">${escapeHtml(tr.allYears)}</option>
        ${[2022,2023,2024,2025,2026].map((y) => `<option value="${y}"${filters.year === String(y) ? " selected" : ""}>${y}</option>`).join("")}
      </select>
      <label class="text-sm flex items-center gap-2"><input type="checkbox" name="validatedOnly" value="1"${filters.validatedOnly ? " checked" : ""}> ${escapeHtml(tr.validatedOnly)}</label>
      <button type="submit" class="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700">${escapeHtml(tr.filter)}</button>
    </form>
    <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-2 text-left">Photo</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.description)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.ean)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.material)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.hsChina)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.tarabel)}</th>
            <th class="py-2 px-2 text-left">${escapeHtml(tr.import)}</th>
            <th class="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${results.total > 0 ? `<div class="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
        <div>${escapeHtml(tr.page)} ${page} / ${totalPages || 1}</div>
        <div class="flex gap-4">${prevPage}${nextPage}</div>
      </div>` : ""}
    </div>
  `;
  return layout(tr.catalogTitle, body, "products", lang, currentQuery);
}

export function renderProductDetail(p: ProductRow, history: ProductRow[], lang: Lang): string {
  const tr = t(lang);
  const photo = p.photo_path
    ? `<img src="/photo/${encodeURIComponent(p.photo_path)}" class="max-w-full rounded-lg shadow border border-slate-200">`
    : `<div class="bg-slate-100 rounded-lg p-12 text-center text-slate-400">${escapeHtml(tr.noPhoto)}</div>`;
  const codesUsed = [...new Set(history.map((h) => h.tarabel_validated).filter(Boolean))] as string[];
  const codesWarning = codesUsed.length > 1
    ? `<div class="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3 text-sm text-yellow-800">⚠️ ${escapeHtml(tr.productHistoryWarning)} <strong>${codesUsed.length}</strong> codes : ${codesUsed.map((c) => `<a href="/codes/${c}" class="bg-yellow-100 px-1 rounded hover:bg-yellow-200 font-mono">${escapeHtml(c)}</a>`).join(" · ")}</div>`
    : "";
  const historyRows = history.map((h) => `
    <tr class="border-b border-slate-100 ${h.id === p.id ? "bg-blue-50" : ""}">
      <td class="py-2 px-3 text-sm"><a href="/imports/${h.import_id}" class="text-blue-600 hover:underline">${escapeHtml(h.folder_name)}</a></td>
      <td class="py-2 px-3 text-xs font-mono">${escapeHtml(h.hs_china ?? "—")}</td>
      <td class="py-2 px-3 text-xs font-mono">${h.tarabel_validated ? `<a href="/codes/${h.tarabel_validated}" class="text-blue-600 hover:underline">${escapeHtml(h.tarabel_validated)}</a>` : "—"}</td>
      <td class="py-2 px-3 text-xs text-right">${h.price_usd ?? ""}</td>
      <td class="py-2 px-3 text-xs text-right">${h.quantity ?? ""}</td>
    </tr>`).join("");

  const titleDesc = lang === "fr"
    ? (p.fr_description || p.english_description || p.nl_description || tr.noDescription)
    : (p.nl_description || p.english_description || p.fr_description || tr.noDescription);

  const body = `
    <div class="mb-4 flex items-center gap-3">
      <a href="/products" class="text-blue-600 text-sm hover:underline">${escapeHtml(tr.backToCatalog)}</a>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-1">${photo}</div>
      <div class="lg:col-span-2">
        ${codesWarning}
        <h1 class="text-xl font-bold mb-1">${escapeHtml(titleDesc)}</h1>
        <div class="text-sm text-slate-600 mb-1">${escapeHtml(p.chinese_description ?? "")}</div>
        <div class="text-sm text-slate-600 mb-3">${escapeHtml(p.english_description ?? "")}</div>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-slate-500">${escapeHtml(tr.ean)}</dt><dd class="font-mono">${escapeHtml(p.ean ?? "—")}</dd>
          <dt class="text-slate-500">${escapeHtml(tr.material)}</dt><dd>${materialCell(p.material, lang) || "—"}</dd>
          <dt class="text-slate-500">${escapeHtml(tr.hsChina)}</dt><dd class="font-mono">${escapeHtml(p.hs_china ?? "—")}</dd>
          <dt class="text-slate-500">${escapeHtml(tr.tarabel)}</dt><dd class="font-mono">${
            p.tarabel_validated
              ? `<a href="/codes/${p.tarabel_validated}" class="text-blue-600 hover:underline">${escapeHtml(p.tarabel_validated)}</a> <span class="inline-block ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${p.tarabel_source === "customs_pdf" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}" title="${escapeHtml(p.tarabel_source === "customs_pdf" ? tr.cardCustomsValidatedSub : tr.cardInternalEstimateSub)}">${escapeHtml(p.tarabel_source === "customs_pdf" ? tr.badgeCustomsValidated : tr.badgeInternalEstimate)}</span>`
              : "—"
          }</dd>
          <dt class="text-slate-500">${escapeHtml(tr.invoer)}</dt><dd>${p.invoer_pct != null ? (p.invoer_pct * 100).toFixed(2) + "%" : "—"}</dd>
          <dt class="text-slate-500">${escapeHtml(tr.priceUsd)}</dt><dd>${p.price_usd ?? "—"}</dd>
          <dt class="text-slate-500">${escapeHtml(tr.quantity)}</dt><dd>${p.quantity ?? "—"}</dd>
          <dt class="text-slate-500">${escapeHtml(tr.import)}</dt><dd><a href="/imports/${p.import_id}" class="text-blue-600 hover:underline">${escapeHtml(p.folder_name)}</a></dd>
        </dl>
      </div>
    </div>
    ${history.length > 1 ? `
      <div class="mt-8">
        <h2 class="font-semibold mb-3">${escapeHtml(tr.productHistory)} (${history.length})</h2>
        <div class="bg-white rounded-lg border border-slate-200">
          <table class="w-full">
            <thead class="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th class="py-2 px-3 text-left">${escapeHtml(tr.import)}</th><th class="py-2 px-3 text-left">${escapeHtml(tr.hsChina)}</th><th class="py-2 px-3 text-left">${escapeHtml(tr.tarabel)}</th><th class="py-2 px-3 text-right">${escapeHtml(tr.priceUsd)}</th><th class="py-2 px-3 text-right">${escapeHtml(tr.quantity)}</th></tr>
            </thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
    ` : ""}
  `;
  return layout(titleDesc, body, "products", lang, `/products/${p.id}`);
}
