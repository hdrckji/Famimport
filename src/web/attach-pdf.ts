import { parseCustomsPdf } from "../customs/parse.js";
import { getDb } from "./db.js";

export interface AttachPdfResult {
  declarationId: number;
  lineCount: number;
  format: string;
  matchedProducts: number;
  productsWithoutMatch: number;
}

/**
 * Attach a customs PDF to an existing import (typically one promoted from an upload).
 * Parses the PDF, persists declaration + lines, and upgrades products' tarabel_validated
 * to source='customs_pdf' where the matching algorithm finds a confident hit.
 *
 * Matching strategy (per user decision — drops hs_china as a hint):
 *   1. Use the product's existing tarabel_validated (only when source = 'claude_vision'
 *      or 'manual' — i.e. an estimate we believe is good) as match hint.
 *   2. If that produces no candidate, leave the product as-is (still estimated).
 *
 * For each hint code, try:
 *   - exact 10-digit match
 *   - 6-digit prefix → unique candidate
 *   - 4-digit prefix → unique candidate
 */
export async function attachCustomsPdf(importId: number, pdfPath: string): Promise<AttachPdfResult> {
  const db = getDb();

  const imp = db.prepare("SELECT id, phase FROM imports WHERE id = ?").get(importId) as
    | { id: number; phase: string | null }
    | undefined;
  if (!imp) throw new Error(`Import ${importId} introuvable`);

  const existing = db
    .prepare("SELECT id FROM customs_declarations WHERE import_id = ?")
    .get(importId) as { id: number } | undefined;
  if (existing) throw new Error(`Un PDF douanier est déjà attaché à cet import (déclaration #${existing.id})`);

  const decl = await parseCustomsPdf(pdfPath);
  if (!decl) throw new Error("Le PDF n'a pas pu être parsé (format non reconnu ou OCR requis)");
  if (decl.lines.length === 0) throw new Error("PDF parsé mais aucune ligne extraite");

  const insertDecl = db.prepare(`
    INSERT INTO customs_declarations (import_id, pdf_path, format, mrn, acceptance_date, line_count, raw_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLine = db.prepare(`
    INSERT INTO customs_lines (declaration_id, line_number, hs_code, description, gross_mass, net_mass, statistical_value, duty_rate, duty_amount, vat_rate, raw_block)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateProduct = db.prepare(
    "UPDATE products SET tarabel_validated = ?, tarabel_source = 'customs_pdf' WHERE id = ?",
  );
  const markPhase = db.prepare("UPDATE imports SET phase = 'customs_validated' WHERE id = ?");

  let declIdOut = 0;
  let matched = 0;
  let unmatched = 0;

  db.transaction(() => {
    const declResult = insertDecl.run(
      importId,
      pdfPath,
      decl.format,
      decl.mrn ?? null,
      decl.acceptanceDate ?? null,
      decl.lines.length,
      decl.rawText.slice(0, 20000),
    );
    declIdOut = Number(declResult.lastInsertRowid);

    for (const line of decl.lines) {
      insertLine.run(
        declIdOut,
        line.lineNumber,
        line.hsCode,
        line.description ?? null,
        line.grossMass ?? null,
        line.netMass ?? null,
        line.statisticalValue ?? null,
        line.dutyRate ?? null,
        line.dutyAmount ?? null,
        line.vatRate ?? null,
        line.rawBlock ?? null,
      );
    }

    const customsCodes = decl.lines.map((l) => l.hsCode);

    function tryMatch(hint: string): string | null {
      const exact10 = customsCodes.find((c) => c === hint);
      if (exact10) return exact10;
      const m6 = customsCodes.filter((c) => c.startsWith(hint.slice(0, 6)));
      if (m6.length === 1) return m6[0];
      const m4 = customsCodes.filter((c) => c.startsWith(hint.slice(0, 4)));
      if (m4.length === 1) return m4[0];
      return null;
    }

    const products = db
      .prepare(
        `SELECT id, tarabel_validated, tarabel_source FROM products WHERE import_id = ?`,
      )
      .all(importId) as Array<{ id: number; tarabel_validated: string | null; tarabel_source: string | null }>;

    for (const p of products) {
      if (p.tarabel_source === "customs_pdf") continue;
      // Only use estimates we trust as a hint: claude_vision or manual. Never hs_china.
      const trusted =
        p.tarabel_source === "claude_vision" || p.tarabel_source === "manual" || p.tarabel_source === "packing_list";
      const hint = trusted && p.tarabel_validated ? p.tarabel_validated : null;
      if (!hint) {
        unmatched++;
        continue;
      }
      const chosen = tryMatch(hint);
      if (chosen) {
        updateProduct.run(chosen, p.id);
        matched++;
      } else {
        unmatched++;
      }
    }

    markPhase.run(importId);
  })();

  return {
    declarationId: declIdOut,
    lineCount: decl.lines.length,
    format: decl.format,
    matchedProducts: matched,
    productsWithoutMatch: unmatched,
  };
}
