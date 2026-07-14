import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./web/db.js";
import { ingestTarbelPath } from "./tarabel/ingest.js";
import { ingestCircabcXlsx } from "./tarabel/ingest-xlsx.js";
import { nomenclatureCount, isNomenclatureAuthoritative } from "./tarabel/validate.js";

/**
 * Ingestion de la nomenclature officielle.
 *
 * Deux formats acceptés (fichier unique ou dossier mixte) :
 * - XML TARBEL/TARIC "TariffHistoryResponse" (extraction complète ou deltas journaliers)
 * - XLSX CIRCABC "TARIC Full database" (Declarable codes / Nomenclature FR / NL / Duties Import)
 *
 * Usage :
 *   npm run ingest-tarbel -- <fichier | dossier> [--force]
 */

const args = process.argv.slice(2);
const force = args.includes("--force");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("Usage: npm run ingest-tarbel -- <fichier.xml|.xlsx | dossier> [--force]");
  process.exit(1);
}

const db = getDb();
const stat = fs.statSync(target);
const all = stat.isDirectory()
  ? fs.readdirSync(target).map((f) => path.join(target, f))
  : [target];

// Les xlsx CIRCABC d'abord (état complet), dans l'ordre : codes déclarables,
// puis descriptions, puis droits. Les deltas XML s'appliquent par-dessus.
const xlsxOrder = ["declarable codes", "nomenclature fr", "nomenclature nl", "duties import"];
const xlsxFiles = all
  .filter((f) => f.toLowerCase().endsWith(".xlsx"))
  .sort((a, b) => {
    const rank = (f: string) =>
      xlsxOrder.findIndex((p) => path.basename(f).toLowerCase().startsWith(p));
    return rank(a) - rank(b);
  });
const xmlTargets = stat.isDirectory() ? [target] : all.filter((f) => f.toLowerCase().endsWith(".xml"));

for (const f of xlsxFiles) {
  const res = await ingestCircabcXlsx(db, f);
  if (!res) {
    console.log(`— ${path.basename(f)} : fichier xlsx non reconnu, ignoré`);
    continue;
  }
  console.log(`✓ ${res.file} [${res.kind}] : ${res.applied}/${res.rows} lignes appliquées`);
}

for (const t of xmlTargets) {
  const results = await ingestTarbelPath(db, t, { force });
  for (const r of results) {
    if (r.skipped) {
      console.log(`— ${r.file} : déjà ingéré (utiliser --force pour refaire)`);
      continue;
    }
    console.log(
      `✓ ${r.file} : ${r.blocks} blocs (${r.created} créations, ${r.updated} mises à jour, ${r.deleted} suppressions)`,
    );
  }
}

const count = nomenclatureCount(db);
console.log(`\nNomenclature : ${count} codes actifs en base.`);
if (isNomenclatureAuthoritative(db)) {
  console.log("→ Nomenclature complète : la validation des codes est ACTIVE (bloquante à l'export).");
} else {
  console.log(
    "⚠ Nomenclature incomplète (probablement des exports différentiels journaliers uniquement).\n" +
      "  La validation restera en mode informatif tant qu'une extraction complète n'est pas chargée.",
  );
}
