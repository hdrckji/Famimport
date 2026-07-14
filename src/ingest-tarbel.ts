import "dotenv/config";
import { getDb } from "./web/db.js";
import { ingestTarbelPath } from "./tarabel/ingest.js";
import { nomenclatureCount, isNomenclatureAuthoritative } from "./tarabel/validate.js";

/**
 * Ingestion de la nomenclature officielle TARBEL depuis les exports XML.
 *
 * Usage :
 *   npm run ingest-tarbel -- <fichier.xml | dossier> [--force]
 *
 * --force : ré-ingère les fichiers déjà traités (par défaut ils sont sautés).
 */

const args = process.argv.slice(2);
const force = args.includes("--force");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("Usage: npm run ingest-tarbel -- <fichier.xml | dossier> [--force]");
  process.exit(1);
}

const db = getDb();
const results = await ingestTarbelPath(db, target, { force });

let totalBlocks = 0;
for (const r of results) {
  if (r.skipped) {
    console.log(`— ${r.file} : déjà ingéré (utiliser --force pour refaire)`);
    continue;
  }
  totalBlocks += r.blocks;
  console.log(
    `✓ ${r.file} : ${r.blocks} blocs (${r.created} créations, ${r.updated} mises à jour, ${r.deleted} suppressions)`,
  );
}

const count = nomenclatureCount(db);
console.log(`\nNomenclature : ${count} codes actifs en base (${totalBlocks} blocs traités).`);
if (isNomenclatureAuthoritative(db)) {
  console.log("→ Nomenclature complète : la validation des codes est ACTIVE (bloquante à l'export).");
} else {
  console.log(
    "⚠ Nomenclature incomplète (probablement des exports différentiels journaliers uniquement).\n" +
      "  La validation restera en mode informatif tant que l'extraction initiale complète TARBEL n'est pas chargée.",
  );
}
