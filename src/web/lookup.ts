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
  code: string | null;
  invoerPct: number | null;
  note: string;
  historyCodes?: string[];
  historyCount?: number;
}

interface EanRow {
  tarabel_validated: string | null;
  invoer_pct: number | null;
  english_description: string | null;
}

export function lookupCatalog(db: Database.Database, input: CatalogMatch): LookupResult {
  if (input.ean) {
    const rows = db.prepare(`
      SELECT tarabel_validated, invoer_pct, english_description
      FROM products
      WHERE ean = ? AND tarabel_validated IS NOT NULL AND tarabel_validated != ''
      ORDER BY id DESC
    `).all(input.ean) as EanRow[];

    if (rows.length > 0) {
      const codeCounts = new Map<string, number>();
      const codeToInvoer = new Map<string, number | null>();
      for (const r of rows) {
        if (!r.tarabel_validated) continue;
        codeCounts.set(r.tarabel_validated, (codeCounts.get(r.tarabel_validated) ?? 0) + 1);
        if (!codeToInvoer.has(r.tarabel_validated)) codeToInvoer.set(r.tarabel_validated, r.invoer_pct);
      }
      const uniqueCodes = [...codeCounts.entries()].sort((a, b) => b[1] - a[1]);
      const totalUses = rows.length;
      const [topCode, topCount] = uniqueCodes[0];

      if (uniqueCodes.length === 1) {
        return {
          source: "ean_unique",
          confidence: "high",
          code: topCode,
          invoerPct: codeToInvoer.get(topCode) ?? null,
          note: `EAN trouvé ${totalUses}× dans le catalogue, toujours classé ${topCode}.`,
          historyCodes: [topCode],
          historyCount: totalUses,
        };
      }
      const dominance = topCount / totalUses;
      if (dominance >= 0.75) {
        return {
          source: "ean_dominant",
          confidence: "medium",
          code: topCode,
          invoerPct: codeToInvoer.get(topCode) ?? null,
          note: `EAN trouvé ${totalUses}× (${topCount} fois sous ${topCode}, soit ${Math.round(dominance * 100)}%) mais ${uniqueCodes.length} codes différents au total.`,
          historyCodes: uniqueCodes.map(([c]) => c),
          historyCount: totalUses,
        };
      }
      return {
        source: "ean_unstable",
        confidence: "low",
        code: topCode,
        invoerPct: codeToInvoer.get(topCode) ?? null,
        note: `EAN trouvé ${totalUses}× mais classé sous ${uniqueCodes.length} codes différents. À revoir manuellement.`,
        historyCodes: uniqueCodes.map(([c]) => c),
        historyCount: totalUses,
      };
    }
  }

  if (input.chineseDescription && input.chineseDescription.length >= 3) {
    const rows = db.prepare(`
      SELECT tarabel_validated, invoer_pct, COUNT(*) AS n
      FROM products
      WHERE chinese_description = ?
        AND tarabel_validated IS NOT NULL AND tarabel_validated != ''
      GROUP BY tarabel_validated
      ORDER BY n DESC
    `).all(input.chineseDescription) as Array<{ tarabel_validated: string; invoer_pct: number | null; n: number }>;

    if (rows.length > 0) {
      const total = rows.reduce((s, r) => s + r.n, 0);
      const top = rows[0];
      if (rows.length === 1) {
        return {
          source: "desc_match",
          confidence: "medium",
          code: top.tarabel_validated,
          invoerPct: top.invoer_pct,
          note: `Description chinoise identique trouvée ${total}× dans le catalogue, toujours classée ${top.tarabel_validated}.`,
          historyCodes: [top.tarabel_validated],
          historyCount: total,
        };
      }
      return {
        source: "desc_match",
        confidence: "low",
        code: top.tarabel_validated,
        invoerPct: top.invoer_pct,
        note: `Description chinoise déjà vue ${total}× sous ${rows.length} codes différents.`,
        historyCodes: rows.map((r) => r.tarabel_validated),
        historyCount: total,
      };
    }
  }

  return {
    source: "none",
    confidence: "none",
    code: null,
    invoerPct: null,
    note: "Pas de match dans le catalogue historique.",
  };
}
