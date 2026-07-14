import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type Database from "better-sqlite3";

/**
 * Ingestion des exports XML TARBEL/TARIC (format "TariffHistoryResponse",
 * service DispatchDataExportXMLData). Fonctionne pour :
 * - l'extraction initiale complète (toute la nomenclature)
 * - les exports différentiels journaliers (créations/modifications/suppressions)
 *
 * Seuls les blocs <GoodsNomenclature> nous intéressent : ils portent le code
 * marchandise à 10 chiffres, le suffixe de ligne produit (80 = ligne déclarable),
 * les dates de validité et les descriptions multilingues.
 *
 * Le parsing est fait en streaming ligne par ligne (les extractions complètes
 * peuvent peser des centaines de Mo) : on accumule chaque bloc
 * <GoodsNomenclature>…</GoodsNomenclature> puis on l'analyse isolément.
 */

export interface NomenclatureEntry {
  opType: string; // C = création, U = mise à jour, D = suppression
  code: string;
  suffix: string;
  sid: number | null;
  validityStart: string | null;
  validityEnd: string | null;
  descriptions: Partial<Record<"FR" | "NL" | "EN", string>>;
}

export interface IngestFileResult {
  file: string;
  blocks: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: boolean;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
}

export function parseGoodsNomenclatureBlock(block: string): NomenclatureEntry | null {
  const code = tag(block, "goodsNomenclatureItemId");
  if (!code) return null;

  // Le premier <metainfo> du bloc est celui du GoodsNomenclature lui-même
  // (les sous-éléments comme les descriptions ont leur propre metainfo).
  const metainfo = tag(block, "metainfo") ?? "";
  const opType = tag(metainfo, "opType") ?? "U";

  const descriptions: NomenclatureEntry["descriptions"] = {};
  const descRe = /<goodsNomenclatureDescription>([\s\S]*?)<\/goodsNomenclatureDescription>/g;
  let m: RegExpExecArray | null;
  while ((m = descRe.exec(block)) !== null) {
    const langId = tag(m[1], "languageId");
    const description = tag(m[1], "description");
    if (langId && description && (langId === "FR" || langId === "NL" || langId === "EN")) {
      descriptions[langId] = unescapeXml(description);
    }
  }

  return {
    opType,
    code,
    suffix: tag(block, "produclineSuffix") ?? "80",
    sid: tag(block, "sid") ? Number(tag(block, "sid")) : null,
    validityStart: tag(block, "validityStartDate"),
    validityEnd: tag(block, "validityEndDate"),
    descriptions,
  };
}

async function* streamGoodsNomenclatureBlocks(filePath: string): AsyncGenerator<string> {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let depth = 0;
  let buf: string[] = [];
  for await (const line of rl) {
    if (depth === 0) {
      if (line.includes("<GoodsNomenclature>")) {
        depth = 1;
        buf = [line];
      }
      continue;
    }
    buf.push(line);
    // Les exports imbriquent parfois d'autres éléments, mais jamais un
    // <GoodsNomenclature> dans un <GoodsNomenclature> : fermeture simple.
    if (line.includes("</GoodsNomenclature>")) {
      depth = 0;
      yield buf.join("\n");
      buf = [];
    }
  }
}

export async function ingestTarbelFile(
  db: Database.Database,
  filePath: string,
  opts: { force?: boolean } = {},
): Promise<IngestFileResult> {
  const fileName = path.basename(filePath);
  const already = db.prepare("SELECT 1 FROM nomenclature_files WHERE file_name = ?").get(fileName);
  if (already && !opts.force) {
    return { file: fileName, blocks: 0, created: 0, updated: 0, deleted: 0, skipped: true };
  }

  const upsert = db.prepare(`
    INSERT INTO nomenclature (code, suffix, sid, description_fr, description_nl, description_en,
                              validity_start, validity_end, deleted, updated_at)
    VALUES (@code, @suffix, @sid, @fr, @nl, @en, @start, @end, 0, datetime('now'))
    ON CONFLICT(code, suffix) DO UPDATE SET
      sid = COALESCE(excluded.sid, nomenclature.sid),
      description_fr = COALESCE(excluded.description_fr, nomenclature.description_fr),
      description_nl = COALESCE(excluded.description_nl, nomenclature.description_nl),
      description_en = COALESCE(excluded.description_en, nomenclature.description_en),
      validity_start = COALESCE(excluded.validity_start, nomenclature.validity_start),
      validity_end = excluded.validity_end,
      deleted = 0,
      updated_at = excluded.updated_at
  `);
  const markDeleted = db.prepare(
    "UPDATE nomenclature SET deleted = 1, updated_at = datetime('now') WHERE code = ? AND suffix = ?",
  );
  const insertDeleted = db.prepare(`
    INSERT INTO nomenclature (code, suffix, sid, validity_start, deleted, updated_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(code, suffix) DO UPDATE SET deleted = 1, updated_at = datetime('now')
  `);

  let blocks = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;

  // On accumule les entrées puis on écrit dans une transaction unique par fichier
  const entries: NomenclatureEntry[] = [];
  for await (const block of streamGoodsNomenclatureBlocks(filePath)) {
    const entry = parseGoodsNomenclatureBlock(block);
    if (entry) entries.push(entry);
  }

  const tx = db.transaction(() => {
    for (const e of entries) {
      blocks++;
      if (e.opType === "D") {
        const res = markDeleted.run(e.code, e.suffix);
        if (res.changes === 0) insertDeleted.run(e.code, e.suffix, e.sid, e.validityStart);
        deleted++;
      } else {
        upsert.run({
          code: e.code,
          suffix: e.suffix,
          sid: e.sid,
          fr: e.descriptions.FR ?? null,
          nl: e.descriptions.NL ?? null,
          en: e.descriptions.EN ?? null,
          start: e.validityStart,
          end: e.validityEnd,
        });
        if (e.opType === "C") created++;
        else updated++;
      }
    }
    db.prepare(
      "INSERT INTO nomenclature_files (file_name, blocks) VALUES (?, ?) ON CONFLICT(file_name) DO UPDATE SET ingested_at = datetime('now'), blocks = excluded.blocks",
    ).run(fileName, blocks);
  });
  tx();

  return { file: fileName, blocks, created, updated, deleted, skipped: false };
}

/**
 * Ingère un fichier ou tous les .xml d'un dossier, dans l'ordre chronologique
 * des noms de fichiers (les exports journaliers sont nommés par date, donc
 * l'ordre lexicographique = l'ordre chronologique : le dernier état gagne).
 */
export async function ingestTarbelPath(
  db: Database.Database,
  target: string,
  opts: { force?: boolean } = {},
): Promise<IngestFileResult[]> {
  const stat = fs.statSync(target);
  const files = stat.isDirectory()
    ? fs
        .readdirSync(target)
        .filter((f) => f.toLowerCase().endsWith(".xml"))
        .sort()
        .map((f) => path.join(target, f))
    : [target];

  const results: IngestFileResult[] = [];
  for (const f of files) {
    results.push(await ingestTarbelFile(db, f, opts));
  }
  return results;
}
