import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db.js";
import type { UploadRow } from "./upload.js";

/**
 * Descriptions produit pour la feuille "bewerkt" de l'export :
 * - omschrijving : libellé NL court style étiquette (colonne B)
 * - nl : description néerlandaise (colonne C)
 * - fr : description française (colonne D)
 *
 * Sources par priorité : cache (upload_rows.desc_*), catalogue historique
 * via EAN (les vrais libellés Famiflora des imports passés), puis génération
 * Claude en batch texte pour les produits jamais vus. Sans clé API on exporte
 * ce que le catalogue fournit et on laisse le reste vide — jamais d'échec.
 */
export interface RowDescriptions {
  omschrijving: string;
  nl: string;
  fr: string;
}

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-7";
const BATCH_SIZE = 20;

const SYSTEM = `Tu rédiges des libellés produits pour l'ERP d'un magasin belge (Famiflora) à partir de packing lists chinoises.
Pour chaque produit, génère :
- "omschrijving" : libellé néerlandais COURT style étiquette rayon (max 50 caractères), ex. "Badspons", "Bokaal glas met kurk 47x70mm", "Kerstfiguur textiel 30cm". Inclus dimension/contenance si connue, n'invente jamais de dimension absente.
- "nl" : description néerlandaise complète mais concise (une ligne).
- "fr" : la même description en français.
Si une valeur "déjà connue" est fournie pour un champ, recopie-la EXACTEMENT dans ta réponse au lieu d'en générer une nouvelle.
Réponds UNIQUEMENT avec un tableau JSON, sans texte autour :
[{"i": <id>, "omschrijving": "...", "nl": "...", "fr": "..."}]`;

function parseBatch(text: string): Array<{ i: number } & Partial<RowDescriptions>> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("Réponse sans tableau JSON");
  const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!Array.isArray(arr)) throw new Error("Réponse JSON non-tableau");
  return arr
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o) => ({
      i: Number(o.i),
      omschrijving: typeof o.omschrijving === "string" ? o.omschrijving.trim() : undefined,
      nl: typeof o.nl === "string" ? o.nl.trim() : undefined,
      fr: typeof o.fr === "string" ? o.fr.trim() : undefined,
    }))
    .filter((o) => Number.isFinite(o.i));
}

function buildBatchPrompt(items: Array<{ row: UploadRow; hint: Partial<RowDescriptions> }>): string {
  const lines = ["Produits :"];
  for (const { row, hint } of items) {
    const parts = [
      `#${row.id}`,
      `EN: ${row.english_description || "(vide)"}`,
      `CN: ${row.chinese_description || "(vide)"}`,
      `Matériau: ${row.material || "(vide)"}`,
    ];
    if (row.claude_justification) parts.push(`Analyse: ${row.claude_justification}`);
    if (hint.omschrijving) parts.push(`omschrijving déjà connue: ${hint.omschrijving}`);
    if (hint.nl) parts.push(`nl déjà connue: ${hint.nl}`);
    if (hint.fr) parts.push(`fr déjà connue: ${hint.fr}`);
    lines.push(parts.join(" | "));
  }
  return lines.join("\n");
}

export async function ensureDescriptions(rows: UploadRow[]): Promise<Map<number, RowDescriptions>> {
  const db = getDb();
  const out = new Map<number, RowDescriptions>();

  // Meilleur libellé historique pour cet EAN (la ligne qui couvre le plus de champs)
  const catalogLookup = db.prepare(`
    SELECT omschrijving, nl_description, fr_description
    FROM products
    WHERE ean = ? AND ean != ''
    ORDER BY
      (CASE WHEN omschrijving IS NOT NULL AND omschrijving != '' THEN 1 ELSE 0 END)
      + (CASE WHEN nl_description IS NOT NULL AND nl_description != '' THEN 1 ELSE 0 END)
      + (CASE WHEN fr_description IS NOT NULL AND fr_description != '' THEN 1 ELSE 0 END) DESC,
      id DESC
    LIMIT 1
  `);
  const saveCache = db.prepare(
    `UPDATE upload_rows SET desc_omschrijving = ?, desc_nl = ?, desc_fr = ? WHERE id = ?`,
  );

  const pending: Array<{ row: UploadRow; hint: Partial<RowDescriptions> }> = [];

  for (const r of rows) {
    if (r.desc_omschrijving || r.desc_nl || r.desc_fr) {
      out.set(r.id, {
        omschrijving: r.desc_omschrijving ?? "",
        nl: r.desc_nl ?? "",
        fr: r.desc_fr ?? "",
      });
      continue;
    }
    const hint: Partial<RowDescriptions> = {};
    if (r.nl_description) hint.nl = r.nl_description;
    if (r.fr_description) hint.fr = r.fr_description;
    if (r.ean) {
      const hit = catalogLookup.get(r.ean) as
        | { omschrijving: string | null; nl_description: string | null; fr_description: string | null }
        | undefined;
      if (hit) {
        if (!hint.omschrijving && hit.omschrijving) hint.omschrijving = hit.omschrijving;
        if (!hint.nl && hit.nl_description) hint.nl = hit.nl_description;
        if (!hint.fr && hit.fr_description) hint.fr = hit.fr_description;
      }
    }
    if (hint.omschrijving && hint.nl && hint.fr) {
      const full = hint as RowDescriptions;
      out.set(r.id, full);
      saveCache.run(full.omschrijving, full.nl, full.fr, r.id);
      continue;
    }
    pending.push({ row: r, hint });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (pending.length > 0 && apiKey) {
    const client = new Anthropic({ apiKey });
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4000,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildBatchPrompt(batch) }],
        });
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        if (!textBlock) throw new Error("Réponse Claude vide");
        const byId = new Map(parseBatch(textBlock.text).map((o) => [o.i, o]));
        for (const { row, hint } of batch) {
          const gen = byId.get(row.id);
          // Les libellés historiques Famiflora priment toujours sur le généré
          const full: RowDescriptions = {
            omschrijving: hint.omschrijving || gen?.omschrijving || "",
            nl: hint.nl || gen?.nl || "",
            fr: hint.fr || gen?.fr || "",
          };
          out.set(row.id, full);
          // On ne met en cache que les lignes complètes : une ligne partielle
          // sera retentée au prochain export au lieu de rester figée à moitié vide
          if (full.omschrijving && full.nl && full.fr) {
            saveCache.run(full.omschrijving, full.nl, full.fr, row.id);
          }
        }
      } catch (err) {
        console.warn(
          `[describe] Batch descriptions ${i / BATCH_SIZE + 1} en erreur : ${err instanceof Error ? err.message : err}`,
        );
        for (const { row, hint } of batch) {
          out.set(row.id, {
            omschrijving: hint.omschrijving ?? "",
            nl: hint.nl ?? "",
            fr: hint.fr ?? "",
          });
        }
      }
    }
  } else {
    for (const { row, hint } of pending) {
      out.set(row.id, {
        omschrijving: hint.omschrijving ?? "",
        nl: hint.nl ?? "",
        fr: hint.fr ?? "",
      });
    }
    if (pending.length > 0 && !apiKey) {
      console.warn(
        `[describe] ANTHROPIC_API_KEY absente — ${pending.length} ligne(s) exportée(s) sans description générée`,
      );
    }
  }

  return out;
}
