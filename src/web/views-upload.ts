import { escapeHtml, layout } from "./layout.js";
import { translateMaterial, t, type Lang } from "./i18n.js";
import type { UploadRow, UploadSummary } from "./upload.js";
import { getPromotedImportId } from "./promote.js";

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

function effectiveCode(r: UploadRow): { code: string | null; confidence: string | null; source: string; note: string; fromClaude: boolean } {
  if (r.user_code) {
    return { code: r.user_code, confidence: r.suggestion_confidence, source: "manuel", note: r.suggestion_note ?? "", fromClaude: false };
  }
  if (r.suggested_code) {
    return {
      code: r.suggested_code,
      confidence: r.suggestion_confidence,
      source: r.suggestion_source ?? "catalogue",
      note: r.suggestion_note ?? "",
      fromClaude: false,
    };
  }
  if (r.claude_status === "done" && r.claude_code) {
    return {
      code: r.claude_code,
      confidence: r.claude_confidence,
      source: "claude_vision",
      note: r.claude_justification ?? "",
      fromClaude: true,
    };
  }
  return { code: null, confidence: null, source: r.claude_status ?? "", note: r.claude_error ?? "", fromClaude: false };
}

export function renderUploadDetail(upload: UploadSummary, rows: UploadRow[], lang: Lang): string {
  const tr = t(lang);
  const total = rows.length;
  const eff = rows.map(effectiveCode);
  const counts = {
    high: eff.filter((e) => e.confidence === "high").length,
    medium: eff.filter((e) => e.confidence === "medium").length,
    low: eff.filter((e) => e.confidence === "low").length,
    none: eff.filter((e) => !e.confidence || e.confidence === "none").length,
  };

  const claudeTotal = upload.claude_total ?? 0;
  const claudeProcessed = upload.claude_processed ?? 0;
  const claudeErrors = upload.claude_errors ?? 0;
  const claudeActive = upload.claude_status === "processing" && claudeTotal > 0;
  const claudePct = claudeTotal > 0 ? Math.round((claudeProcessed / claudeTotal) * 100) : 0;

  const rowsHtml = rows.map((r, i) => {
    const e = eff[i];
    const photo = r.photo_path
      ? `<img src="/upload-photo/${encodeURIComponent(r.photo_path)}" class="w-12 h-12 object-cover rounded" loading="lazy">`
      : `<div class="w-12 h-12 bg-slate-100 rounded"></div>`;
    const divergent = r.hs_china && e.code && r.hs_china !== e.code;

    let codeBadge: string;
    if (e.code) {
      const colorClasses =
        e.confidence === "high" ? "bg-green-100 text-green-800 hover:bg-green-200"
        : e.confidence === "medium" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
        : "bg-red-100 text-red-800 hover:bg-red-200";
      const claudeIcon = e.fromClaude
        ? `<span class="inline-block ml-1 px-1 text-[9px] font-bold rounded bg-purple-100 text-purple-800" title="${lang === "fr" ? "Suggéré par Claude vision" : "Voorgesteld door Claude vision"}">IA</span>`
        : "";
      codeBadge = `<a href="/codes/${e.code}" class="font-mono text-xs px-1.5 py-0.5 rounded ${colorClasses}">${escapeHtml(e.code)}</a>${claudeIcon}`;
    } else if (r.claude_status === "pending" || r.claude_status === "processing") {
      codeBadge = `<span class="text-xs text-purple-600 italic">${lang === "fr" ? "🔍 Claude en cours…" : "🔍 Claude bezig…"}</span>`;
    } else if (r.claude_status === "error") {
      codeBadge = `<span class="text-xs text-red-600" title="${escapeHtml(r.claude_error ?? "")}">${lang === "fr" ? "Erreur Claude" : "Claude-fout"}</span>`;
    } else if (r.claude_status === "skipped") {
      codeBadge = `<span class="text-xs text-slate-400" title="${escapeHtml(r.claude_error ?? "")}">${lang === "fr" ? "à classer" : "te classificeren"}</span>`;
    } else {
      codeBadge = `<span class="text-xs text-slate-400">${lang === "fr" ? "à classer" : "te classificeren"}</span>`;
    }

    let materialCellExtra = materialCell(r.material, lang);
    if (r.claude_material_confirmed === 0 && r.claude_material_note) {
      materialCellExtra += `<div class="text-[10px] text-red-600 mt-0.5" title="${escapeHtml(r.claude_material_note)}">⚠ ${escapeHtml(r.claude_material_note.slice(0, 60))}${r.claude_material_note.length > 60 ? "…" : ""}</div>`;
    } else if (r.claude_material_confirmed === 1) {
      materialCellExtra += `<div class="text-[10px] text-green-600 mt-0.5">✓ ${lang === "fr" ? "confirmé photo" : "bevestigd door foto"}</div>`;
    }

    const invoerPct = e.fromClaude ? r.claude_invoer_pct : r.suggested_invoer_pct;

    return `
      <tr class="border-b border-slate-100">
        <td class="py-2 px-2">${photo}</td>
        <td class="py-2 px-2 text-sm">${escapeHtml(r.english_description ?? "")}<div class="text-xs text-slate-500">${escapeHtml(r.chinese_description ?? "")}</div></td>
        <td class="py-2 px-2 text-xs font-mono">${escapeHtml(r.ean ?? "—")}</td>
        <td class="py-2 px-2 text-xs">${materialCellExtra}</td>
        <td class="py-2 px-2 text-xs font-mono ${divergent ? "text-red-600 font-bold" : ""}">${escapeHtml(r.hs_china ?? "—")}</td>
        <td class="py-2 px-2">${codeBadge}</td>
        <td class="py-2 px-2 text-xs text-right">${invoerPct != null ? (invoerPct * 100).toFixed(1) + "%" : ""}</td>
        <td class="py-2 px-2 text-xs text-slate-500 max-w-xs">${escapeHtml(e.note)}</td>
      </tr>`;
  }).join("");

  const refreshMeta = claudeActive ? `<meta http-equiv="refresh" content="5">` : "";

  const claudeProgressBlock = claudeTotal > 0
    ? `
      <div class="mb-6 bg-purple-50 border border-purple-200 rounded p-3">
        <div class="flex items-center justify-between text-sm">
          <div>
            <span class="font-medium text-purple-900">🔍 Claude vision</span>
            <span class="text-purple-700"> — ${claudeProcessed}/${claudeTotal} ${lang === "fr" ? "produits analysés" : "producten geanalyseerd"}${claudeErrors > 0 ? ` · ${claudeErrors} ${lang === "fr" ? "erreur(s)" : "fout(en)"}` : ""}</span>
          </div>
          <span class="text-xs ${claudeActive ? "text-purple-600 animate-pulse" : "text-green-700"}">${
            claudeActive
              ? (lang === "fr" ? "en cours (refresh auto 5s)…" : "bezig (auto-refresh 5s)…")
              : (lang === "fr" ? "terminé" : "voltooid")
          }</span>
        </div>
        <div class="mt-2 w-full bg-purple-100 rounded-full h-2 overflow-hidden">
          <div class="bg-purple-600 h-2 transition-all" style="width: ${claudePct}%"></div>
        </div>
      </div>
    `
    : "";

  const promotedImportId = getPromotedImportId(upload.id);
  const rowsWithoutCode = eff.filter((e) => !e.code).length;
  const claudeStillRunning = claudeActive;
  const canPromote = !promotedImportId && !claudeStillRunning;
  const promotionBlock = promotedImportId
    ? `
      <div class="mb-4 bg-green-50 border border-green-200 rounded p-3 text-sm">
        ${lang === "fr"
          ? `Cet upload a été promu en import catalogue → <a href="/imports/${promotedImportId}" class="text-green-800 font-medium underline">voir l'import #${promotedImportId}</a>. Tu peux maintenant y attacher le PDF douanier quand il arrive.`
          : `Deze upload is gepromoveerd tot catalogus-import → <a href="/imports/${promotedImportId}" class="text-green-800 font-medium underline">bekijk import #${promotedImportId}</a>.`}
      </div>
    `
    : canPromote
      ? `
        <div class="mb-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm flex items-center justify-between gap-3">
          <div>
            ${lang === "fr"
              ? `Quand tu es satisfait des codes proposés, promeus cet upload en import catalogue. ${rowsWithoutCode > 0 ? `<strong>${rowsWithoutCode} ligne(s) restent sans code</strong> et seront marquées « à classer » dans l'import.` : ""}`
              : `Promoveer deze upload tot catalogus-import wanneer tevreden. ${rowsWithoutCode > 0 ? `<strong>${rowsWithoutCode} regel(s) zonder code</strong> blijven als 'te classificeren'.` : ""}`}
          </div>
          <form action="/uploads/${upload.id}/promote" method="POST">
            <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 whitespace-nowrap">
              ${lang === "fr" ? "Promouvoir en import →" : "Promoveren tot import →"}
            </button>
          </form>
        </div>
      `
      : claudeStillRunning
        ? `<div class="mb-4 bg-slate-50 border border-slate-200 rounded p-3 text-sm text-slate-600">${lang === "fr" ? "La promotion en import sera possible une fois Claude vision terminé." : "Promotie tot import is mogelijk zodra Claude vision klaar is."}</div>`
        : "";

  const body = `
    ${refreshMeta}
    <div class="mb-4 flex items-center gap-3">
      <a href="/uploads" class="text-blue-600 text-sm hover:underline">${lang === "fr" ? "← Imports" : "← Imports"}</a>
      <h1 class="text-2xl font-bold">${escapeHtml(upload.original_name)}</h1>
      <a href="/uploads/${upload.id}/export" class="ml-auto bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
        ${lang === "fr" ? "⬇ Télécharger Excel enrichi" : "⬇ Verrijkte Excel downloaden"}
      </a>
    </div>
    ${promotionBlock}
    ${claudeProgressBlock}
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
