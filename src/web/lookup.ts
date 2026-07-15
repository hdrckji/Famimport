import type Database from "better-sqlite3";

export type SuggestionSource = "ean_unique" | "ean_dominant" | "ean_unstable" | "desc_match" | "none";
export type SuggestionConfidence = "high" | "medium" | "low" | "none";

export interface CatalogMatch {
  ean?: string | null;
  chineseDescription?: string | null;
  englishDescription?: string | null;
  hsChina?: string | null;
}

export interface LookupResult {
  source: SuggestionSource;
  confidence: SuggestionConfidence;
  /** true = historique validé douane (customs_pdf) ; false = estimation interne jamais validée */
  validated: boolean;
  code: string | null;
  invoerPct: number | null;
  note: string;
  historyCodes?: string[];
  historyCount?: number;
}

interface EanRow {
  tarabel_validated: string | null;
  tarabel_source: string | null;
  invoer_pct: number | null;
  english_description: string | null;
}

export function lookupCatalog(db: Database.Database, input: CatalogMatch): LookupResult {
  if (input.ean) {
    const rows = db.prepare(`
      SELECT tarabel_validated, tarabel_source, invoer_pct, english_description
      FROM products
      WHERE ean = ? AND tarabel_validated IS NOT NULL AND tarabel_validated != ''
      ORDER BY (tarabel_source = 'customs_pdf') DESC, id DESC
    `).all(input.ean) as EanRow[];

    if (rows.length > 0) {
      // Split rows by source: customs (validated) vs packing (estimate)
      const customsRows = rows.filter((r) => r.tarabel_source === "customs_pdf");
      const packingRows = rows.filter((r) => r.tarabel_source !== "customs_pdf");

      // Prefer customs-validated history if available — those are 100% reliable
      if (customsRows.length > 0) {
        const codeCounts = new Map<string, number>();
        const codeToInvoer = new Map<string, number | null>();
        for (const r of customsRows) {
          if (!r.tarabel_validated) continue;
          codeCounts.set(r.tarabel_validated, (codeCounts.get(r.tarabel_validated) ?? 0) + 1);
          if (!codeToInvoer.has(r.tarabel_validated)) codeToInvoer.set(r.tarabel_validated, r.invoer_pct);
        }
        const uniqueCodes = [...codeCounts.entries()].sort((a, b) => b[1] - a[1]);
        const totalUses = customsRows.length;
        const [topCode, topCount] = uniqueCodes[0];

        if (uniqueCodes.length === 1) {
          return {
            source: "ean_unique",
            confidence: "high",
            validated: true,
            code: topCode,
            invoerPct: codeToInvoer.get(topCode) ?? null,
            note: `EAN validé douane ${totalUses}× dans le catalogue, toujours classé ${topCode}.`,
            historyCodes: [topCode],
            historyCount: totalUses,
          };
        }
        const dominance = topCount / totalUses;
        if (dominance >= 0.75) {
          return {
            source: "ean_dominant",
            confidence: "medium",
            validated: true,
            code: topCode,
            invoerPct: codeToInvoer.get(topCode) ?? null,
            note: `EAN validé douane ${totalUses}× (${topCount} fois sous ${topCode}, ${Math.round(dominance * 100)}%) mais ${uniqueCodes.length} codes différents.`,
            historyCodes: uniqueCodes.map(([c]) => c),
            historyCount: totalUses,
          };
        }
        return {
          source: "ean_unstable",
          confidence: "low",
          validated: true,
          code: topCode,
          invoerPct: codeToInvoer.get(topCode) ?? null,
          note: `EAN validé douane ${totalUses}× mais sous ${uniqueCodes.length} codes différents. À revoir.`,
          historyCodes: uniqueCodes.map(([c]) => c),
          historyCount: totalUses,
        };
      }

      // No customs match → fall back to packing-list estimates (lower confidence)
      const codeCounts = new Map<string, number>();
      const codeToInvoer = new Map<string, number | null>();
      for (const r of packingRows) {
        if (!r.tarabel_validated) continue;
        codeCounts.set(r.tarabel_validated, (codeCounts.get(r.tarabel_validated) ?? 0) + 1);
        if (!codeToInvoer.has(r.tarabel_validated)) codeToInvoer.set(r.tarabel_validated, r.invoer_pct);
      }
      const uniqueCodes = [...codeCounts.entries()].sort((a, b) => b[1] - a[1]);
      const totalUses = packingRows.length;
      const [topCode, topCount] = uniqueCodes[0];
      const dominance = totalUses ? topCount / totalUses : 0;

      // Even with consistent packing-list classification, cap confidence at "low"
      // because these codes were entered by an internal collaborator without customs validation
      return {
        source: uniqueCodes.length === 1 ? "ean_unique" : dominance >= 0.75 ? "ean_dominant" : "ean_unstable",
        confidence: "low",
        validated: false,
        code: topCode,
        invoerPct: codeToInvoer.get(topCode) ?? null,
        note:
          uniqueCodes.length === 1
            ? `EAN vu ${totalUses}× avec code ${topCode} (estimation interne, jamais validé douane). À revérifier.`
            : `EAN vu ${totalUses}× sous ${uniqueCodes.length} codes différents (estimations internes, jamais validées douane). À revoir.`,
        historyCodes: uniqueCodes.map(([c]) => c),
        historyCount: totalUses,
      };
    }
  }

  if (input.chineseDescription && input.chineseDescription.length >= 3) {
    // Try customs-validated description matches first
    const customsRows = db.prepare(`
      SELECT tarabel_validated, invoer_pct, COUNT(*) AS n
      FROM products
      WHERE chinese_description = ?
        AND tarabel_source = 'customs_pdf'
      GROUP BY tarabel_validated
      ORDER BY n DESC
    `).all(input.chineseDescription) as Array<{ tarabel_validated: string; invoer_pct: number | null; n: number }>;

    if (customsRows.length > 0) {
      const total = customsRows.reduce((s, r) => s + r.n, 0);
      const top = customsRows[0];
      if (customsRows.length === 1) {
        return {
          source: "desc_match",
          confidence: "medium",
          validated: true,
          code: top.tarabel_validated,
          invoerPct: top.invoer_pct,
          note: `Description chinoise identique validée douane ${total}× sous ${top.tarabel_validated}.`,
          historyCodes: [top.tarabel_validated],
          historyCount: total,
        };
      }
      return {
        source: "desc_match",
        confidence: "low",
        validated: true,
        code: top.tarabel_validated,
        invoerPct: top.invoer_pct,
        note: `Description chinoise validée douane ${total}× sous ${customsRows.length} codes différents.`,
        historyCodes: customsRows.map((r) => r.tarabel_validated),
        historyCount: total,
      };
    }

    // Fall back to packing-list estimates
    const packingRows = db.prepare(`
      SELECT tarabel_validated, invoer_pct, COUNT(*) AS n
      FROM products
      WHERE chinese_description = ?
        AND tarabel_validated IS NOT NULL AND tarabel_validated != ''
        AND (tarabel_source IS NULL OR tarabel_source != 'customs_pdf')
      GROUP BY tarabel_validated
      ORDER BY n DESC
    `).all(input.chineseDescription) as Array<{ tarabel_validated: string; invoer_pct: number | null; n: number }>;

    if (packingRows.length > 0) {
      const total = packingRows.reduce((s, r) => s + r.n, 0);
      const top = packingRows[0];
      return {
        source: "desc_match",
        confidence: "low",
        validated: false,
        code: top.tarabel_validated,
        invoerPct: top.invoer_pct,
        note:
          packingRows.length === 1
            ? `Description chinoise identique trouvée ${total}× sous ${top.tarabel_validated} (estimation interne, jamais validée douane).`
            : `Description chinoise vue ${total}× sous ${packingRows.length} codes (estimations internes uniquement, à revoir).`,
        historyCodes: packingRows.map((r) => r.tarabel_validated),
        historyCount: total,
      };
    }
  }

  return {
    source: "none",
    confidence: "none",
    validated: false,
    code: null,
    invoerPct: null,
    note: "Pas de match dans le catalogue historique.",
  };
}
