import { escapeHtml, formatPct, layout } from "./layout.js";
import type { DashboardStats, ImportRow, ProductRow, SearchResult, TopCode } from "./db.js";

export function renderDashboard(
  stats: DashboardStats,
  recentImports: ImportRow[],
  topCodes: TopCode[],
): string {
  const tarabelPct = formatPct(stats.productsWithTarabel, stats.totalProducts);
  const eanPct = formatPct(stats.productsWithEan, stats.totalProducts);

  const cards = [
    ["Imports historisés", stats.totalImports.toString(), "Avec data dans la BDD"],
    ["Produits catalogués", stats.totalProducts.toLocaleString("fr-BE"), `${eanPct} avec EAN`],
    ["Codes Tarabel validés", stats.productsWithTarabel.toLocaleString("fr-BE"), `${tarabelPct} du catalogue`],
    ["Codes uniques utilisés", stats.uniqueTarabelCodes.toString(), "Diversité du catalogue"],
    ["Déclarations parsées", stats.totalDeclarations.toString(), `${stats.totalCustomsLines} lignes douanières`],
    ["EAN uniques", stats.uniqueEans.toString(), `${stats.productsWithEan - stats.uniqueEans} doublons (re-imports)`],
    ["Divergence Chine ↔ Tarabel", `${stats.divergencePct}%`, "Sur produits où on a les 2 codes"],
  ];

  const cardsHtml = cards.map(([label, value, sub]) => `
    <div class="bg-white rounded-lg border border-slate-200 p-4">
      <div class="text-xs uppercase text-slate-500 font-medium">${escapeHtml(label)}</div>
      <div class="text-3xl font-bold text-slate-900 mt-1">${escapeHtml(value)}</div>
      <div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>
    </div>`).join("");

  const importsRows = recentImports.slice(0, 8).map((i) => `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-3"><a href="/imports/${i.id}" class="text-blue-600 hover:underline">${escapeHtml(i.folder_name)}</a></td>
      <td class="py-2 px-3 text-sm">${i.year ?? ""}</td>
      <td class="py-2 px-3 text-sm">${escapeHtml(i.brand ?? "")}</td>
      <td class="py-2 px-3 text-right text-sm">${i.product_count}</td>
      <td class="py-2 px-3 text-right text-sm">${i.validated_count}/${i.product_count}</td>
    </tr>`).join("");

  const codesRows = topCodes.map((c) => `
    <tr class="border-b border-slate-100">
      <td class="py-1.5 px-3 font-mono text-sm">${escapeHtml(c.code)}</td>
      <td class="py-1.5 px-3 text-right text-sm">${c.uses}</td>
    </tr>`).join("");

  return layout("Tableau de bord", `
    <h1 class="text-2xl font-bold mb-4">Tableau de bord</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      ${cardsHtml}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-white rounded-lg border border-slate-200">
        <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 class="font-semibold">Imports récents</h2>
          <a href="/imports" class="text-sm text-blue-600 hover:underline">Voir tous →</a>
        </div>
        <table class="w-full">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th class="py-2 px-3 text-left">Dossier</th><th class="py-2 px-3 text-left">Année</th><th class="py-2 px-3 text-left">Marque</th><th class="py-2 px-3 text-right">Produits</th><th class="py-2 px-3 text-right">Validés</th></tr>
          </thead>
          <tbody>${importsRows}</tbody>
        </table>
      </div>
      <div class="bg-white rounded-lg border border-slate-200">
        <div class="px-4 py-3 border-b border-slate-200">
          <h2 class="font-semibold">Top codes Tarabel</h2>
        </div>
        <table class="w-full">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th class="py-2 px-3 text-left">Code</th><th class="py-2 px-3 text-right">Utilisations</th></tr>
          </thead>
          <tbody>${codesRows}</tbody>
        </table>
      </div>
    </div>
  `, "dashboard");
}

export function renderImports(imports: ImportRow[]): string {
  const rows = imports.map((i) => {
    const cov = i.product_count ? Math.round((i.validated_count / i.product_count) * 100) : 0;
    const covColor = cov >= 80 ? "bg-green-100 text-green-800" : cov >= 40 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-3"><a href="/imports/${i.id}" class="text-blue-600 hover:underline font-medium">${escapeHtml(i.folder_name)}</a></td>
      <td class="py-2 px-3 text-sm">${i.year ?? ""}</td>
      <td class="py-2 px-3 text-sm">${escapeHtml(i.brand ?? "")}</td>
      <td class="py-2 px-3 text-right text-sm">${i.product_count}</td>
      <td class="py-2 px-3"><span class="inline-block px-2 py-0.5 text-xs rounded ${covColor}">${i.validated_count}/${i.product_count} (${cov}%)</span></td>
      <td class="py-2 px-3 text-sm">${i.declaration_count > 0 ? "✓" : "—"}</td>
      <td class="py-2 px-3 text-xs text-slate-500">${escapeHtml(i.schema_variant ?? "")}</td>
    </tr>`;
  }).join("");

  return layout("Imports", `
    <h1 class="text-2xl font-bold mb-4">Imports (${imports.length})</h1>
    <div class="bg-white rounded-lg border border-slate-200">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-3 text-left">Dossier</th>
            <th class="py-2 px-3 text-left">Année</th>
            <th class="py-2 px-3 text-left">Marque</th>
            <th class="py-2 px-3 text-right">Produits</th>
            <th class="py-2 px-3 text-left">Couverture Tarabel</th>
            <th class="py-2 px-3 text-left">PDF douane</th>
            <th class="py-2 px-3 text-left">Onglet</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, "imports");
}

export function renderImportDetail(imp: ImportRow, products: ProductRow[]): string {
  const rows = products.map((p) => {
    const photo = p.photo_path
      ? `<img src="/photo/${encodeURIComponent(p.photo_path)}" class="w-12 h-12 object-cover rounded">`
      : `<div class="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">—</div>`;
    const tarabelCell = p.tarabel_validated
      ? `<span class="font-mono text-sm">${escapeHtml(p.tarabel_validated)}</span><span class="text-xs text-slate-500 ml-1">${p.tarabel_source === "customs_pdf" ? "(PDF)" : "(packing)"}</span>`
      : `<span class="text-slate-400 text-xs">—</span>`;
    const divergent = p.hs_china && p.tarabel_validated && p.hs_china !== p.tarabel_validated;
    return `
    <tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-2 px-2">${photo}</td>
      <td class="py-2 px-2 text-sm">${escapeHtml(p.english_description ?? "")}</td>
      <td class="py-2 px-2 text-xs font-mono">${escapeHtml(p.ean ?? "—")}</td>
      <td class="py-2 px-2 text-xs">${escapeHtml(p.material ?? "")}</td>
      <td class="py-2 px-2 text-xs font-mono ${divergent ? "text-red-600 font-bold" : ""}">${escapeHtml(p.hs_china ?? "—")}</td>
      <td class="py-2 px-2">${tarabelCell}</td>
      <td class="py-2 px-2 text-xs text-right">${p.invoer_pct != null ? (p.invoer_pct * 100).toFixed(1) + "%" : ""}</td>
      <td class="py-2 px-2 text-xs text-right">${p.price_usd ?? ""}</td>
      <td class="py-2 px-2"><a href="/products/${p.id}" class="text-blue-600 text-xs hover:underline">détail</a></td>
    </tr>`;
  }).join("");
  const cov = imp.product_count ? Math.round((imp.validated_count / imp.product_count) * 100) : 0;
  return layout(imp.folder_name, `
    <div class="mb-4 flex items-center gap-3">
      <a href="/imports" class="text-blue-600 text-sm hover:underline">← Imports</a>
      <h1 class="text-2xl font-bold">${escapeHtml(imp.folder_name)}</h1>
      <span class="text-sm text-slate-500">${imp.year} · ${escapeHtml(imp.brand ?? "")} · ${imp.product_count} produits · ${imp.validated_count} validés (${cov}%) · onglet "${escapeHtml(imp.schema_variant ?? "")}"</span>
    </div>
    <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-2 text-left">Photo</th>
            <th class="py-2 px-2 text-left">Description EN</th>
            <th class="py-2 px-2 text-left">EAN</th>
            <th class="py-2 px-2 text-left">Material</th>
            <th class="py-2 px-2 text-left">HS Chine</th>
            <th class="py-2 px-2 text-left">Tarabel validé</th>
            <th class="py-2 px-2 text-right">%invoer</th>
            <th class="py-2 px-2 text-right">Prix USD</th>
            <th class="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, "imports");
}

export function renderProductsSearch(filters: Record<string, string>, results: SearchResult, page: number, limit: number): string {
  const totalPages = Math.ceil(results.total / limit);
  const rows = results.rows.map((p) => {
    const photo = p.photo_path
      ? `<img src="/photo/${encodeURIComponent(p.photo_path)}" class="w-16 h-16 object-cover rounded">`
      : `<div class="w-16 h-16 bg-slate-100 rounded flex items-center justify-center text-slate-300 text-xs">—</div>`;
    const tarabel = p.tarabel_validated
      ? `<span class="font-mono text-xs bg-green-50 text-green-800 px-1.5 py-0.5 rounded">${escapeHtml(p.tarabel_validated)}</span>`
      : `<span class="text-slate-400 text-xs">—</span>`;
    return `
    <tr class="border-b border-slate-100">
      <td class="py-2 px-2">${photo}</td>
      <td class="py-2 px-2 text-sm">
        <div>${escapeHtml(p.english_description ?? "")}</div>
        <div class="text-xs text-slate-500">${escapeHtml(p.chinese_description ?? "")}</div>
        ${p.fr_description ? `<div class="text-xs text-slate-500">${escapeHtml(p.fr_description)}</div>` : ""}
      </td>
      <td class="py-2 px-2 text-xs font-mono">${escapeHtml(p.ean ?? "—")}</td>
      <td class="py-2 px-2 text-xs">${escapeHtml(p.material ?? "")}</td>
      <td class="py-2 px-2 text-xs font-mono">${escapeHtml(p.hs_china ?? "—")}</td>
      <td class="py-2 px-2">${tarabel}</td>
      <td class="py-2 px-2 text-xs"><a href="/imports/${p.import_id}" class="text-blue-600 hover:underline">${escapeHtml(p.folder_name)}</a></td>
      <td class="py-2 px-2"><a href="/products/${p.id}" class="text-blue-600 text-xs hover:underline">détail</a></td>
    </tr>`;
  }).join("");

  const buildQuery = (override: Record<string, string | number>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    for (const [k, v] of Object.entries(override)) params.set(k, String(v));
    return params.toString();
  };
  const prevPage = page > 1 ? `<a href="?${buildQuery({ page: page - 1 })}" class="text-blue-600 hover:underline">← Précédent</a>` : "";
  const nextPage = page < totalPages ? `<a href="?${buildQuery({ page: page + 1 })}" class="text-blue-600 hover:underline">Suivant →</a>` : "";

  return layout("Catalogue", `
    <h1 class="text-2xl font-bold mb-4">Catalogue (${results.total.toLocaleString("fr-BE")} produits)</h1>
    <form class="bg-white rounded-lg border border-slate-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
      <input type="text" name="q" value="${escapeHtml(filters.q ?? "")}" placeholder="Recherche descriptions..." class="border border-slate-300 rounded px-3 py-1.5 text-sm md:col-span-2">
      <input type="text" name="ean" value="${escapeHtml(filters.ean ?? "")}" placeholder="EAN" class="border border-slate-300 rounded px-3 py-1.5 text-sm font-mono">
      <input type="text" name="hsCode" value="${escapeHtml(filters.hsCode ?? "")}" placeholder="Code HS (préfixe ok)" class="border border-slate-300 rounded px-3 py-1.5 text-sm font-mono">
      <select name="brand" class="border border-slate-300 rounded px-3 py-1.5 text-sm">
        <option value="">Toutes marques</option>
        <option value="FAMI"${filters.brand === "FAMI" ? " selected" : ""}>FAMI</option>
        <option value="TROPI"${filters.brand === "TROPI" ? " selected" : ""}>TROPI</option>
      </select>
      <select name="year" class="border border-slate-300 rounded px-3 py-1.5 text-sm">
        <option value="">Toutes années</option>
        ${[2022,2023,2024,2025,2026].map((y) => `<option value="${y}"${filters.year === String(y) ? " selected" : ""}>${y}</option>`).join("")}
      </select>
      <label class="text-sm flex items-center gap-2"><input type="checkbox" name="validatedOnly" value="1"${filters.validatedOnly ? " checked" : ""}> Validés seulement</label>
      <button type="submit" class="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700">Filtrer</button>
    </form>
    <div class="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table class="w-full">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="py-2 px-2 text-left">Photo</th>
            <th class="py-2 px-2 text-left">Description</th>
            <th class="py-2 px-2 text-left">EAN</th>
            <th class="py-2 px-2 text-left">Material</th>
            <th class="py-2 px-2 text-left">HS Chine</th>
            <th class="py-2 px-2 text-left">Tarabel</th>
            <th class="py-2 px-2 text-left">Import</th>
            <th class="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${results.total > 0 ? `<div class="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
        <div>Page ${page} / ${totalPages || 1}</div>
        <div class="flex gap-4">${prevPage}${nextPage}</div>
      </div>` : ""}
    </div>
  `, "products");
}

export function renderProductDetail(p: ProductRow, history: ProductRow[]): string {
  const photo = p.photo_path
    ? `<img src="/photo/${encodeURIComponent(p.photo_path)}" class="max-w-full rounded-lg shadow border border-slate-200">`
    : `<div class="bg-slate-100 rounded-lg p-12 text-center text-slate-400">Pas de photo</div>`;
  const codesUsed = [...new Set(history.map((h) => h.tarabel_validated).filter(Boolean))] as string[];
  const codesWarning = codesUsed.length > 1
    ? `<div class="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3 text-sm text-yellow-800">⚠️ Ce produit a déjà été classé sous <strong>${codesUsed.length} codes différents</strong> au fil des imports : ${codesUsed.map((c) => `<code class="bg-yellow-100 px-1 rounded">${escapeHtml(c)}</code>`).join(" · ")}</div>`
    : "";
  const historyRows = history.map((h) => `
    <tr class="border-b border-slate-100 ${h.id === p.id ? "bg-blue-50" : ""}">
      <td class="py-2 px-3 text-sm"><a href="/imports/${h.import_id}" class="text-blue-600 hover:underline">${escapeHtml(h.folder_name)}</a></td>
      <td class="py-2 px-3 text-xs font-mono">${escapeHtml(h.hs_china ?? "—")}</td>
      <td class="py-2 px-3 text-xs font-mono">${escapeHtml(h.tarabel_validated ?? "—")}</td>
      <td class="py-2 px-3 text-xs text-right">${h.price_usd ?? ""}</td>
      <td class="py-2 px-3 text-xs text-right">${h.quantity ?? ""}</td>
    </tr>`).join("");

  return layout(p.english_description ?? `Produit ${p.id}`, `
    <div class="mb-4 flex items-center gap-3">
      <a href="/products" class="text-blue-600 text-sm hover:underline">← Catalogue</a>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-1">${photo}</div>
      <div class="lg:col-span-2">
        ${codesWarning}
        <h1 class="text-xl font-bold mb-1">${escapeHtml(p.english_description ?? "(no description)")}</h1>
        <div class="text-sm text-slate-600 mb-1">${escapeHtml(p.chinese_description ?? "")}</div>
        <div class="text-sm text-slate-600 mb-3">${escapeHtml(p.fr_description ?? "")}</div>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-slate-500">EAN</dt><dd class="font-mono">${escapeHtml(p.ean ?? "—")}</dd>
          <dt class="text-slate-500">Material</dt><dd>${escapeHtml(p.material ?? "—")}</dd>
          <dt class="text-slate-500">HS Chine</dt><dd class="font-mono">${escapeHtml(p.hs_china ?? "—")}</dd>
          <dt class="text-slate-500">Tarabel validé</dt><dd class="font-mono">${escapeHtml(p.tarabel_validated ?? "—")} ${p.tarabel_source ? `<span class="text-xs text-slate-500">(${escapeHtml(p.tarabel_source)})</span>` : ""}</dd>
          <dt class="text-slate-500">% invoer</dt><dd>${p.invoer_pct != null ? (p.invoer_pct * 100).toFixed(2) + "%" : "—"}</dd>
          <dt class="text-slate-500">Prix USD</dt><dd>${p.price_usd ?? "—"}</dd>
          <dt class="text-slate-500">Quantité</dt><dd>${p.quantity ?? "—"}</dd>
          <dt class="text-slate-500">Import</dt><dd><a href="/imports/${p.import_id}" class="text-blue-600 hover:underline">${escapeHtml(p.folder_name)}</a></dd>
        </dl>
      </div>
    </div>
    ${history.length > 1 ? `
      <div class="mt-8">
        <h2 class="font-semibold mb-3">Historique de ce produit (${history.length} imports)</h2>
        <div class="bg-white rounded-lg border border-slate-200">
          <table class="w-full">
            <thead class="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th class="py-2 px-3 text-left">Import</th><th class="py-2 px-3 text-left">HS Chine</th><th class="py-2 px-3 text-left">Tarabel</th><th class="py-2 px-3 text-right">Prix</th><th class="py-2 px-3 text-right">Qté</th></tr>
            </thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
    ` : ""}
  `, "products");
}
