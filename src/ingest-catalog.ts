import path from "node:path";
import { ingestAll } from "./catalog/ingest.js";

const parentDir =
  process.argv[2] ?? "C:\\Users\\jimmy.hendrickx\\Desktop\\Nouveau dossier";
const dbPath =
  process.argv[3] ?? path.join(process.cwd(), "catalog", "catalog.db");
const photosRoot =
  process.argv[4] ?? path.join(process.cwd(), "catalog", "photos");

console.log(`Parent dir : ${parentDir}`);
console.log(`Database   : ${dbPath}`);
console.log(`Photos root: ${photosRoot}\n`);

const stats = await ingestAll(parentDir, dbPath, photosRoot);

const okCount = stats.filter((s) => s.status === "ok").length;
const skipped = stats.filter((s) => s.status === "skipped").length;
const errors = stats.filter((s) => s.status === "error");
const totalProducts = stats.reduce((sum, s) => sum + s.productsAdded, 0);

console.log("\n========== INGEST SUMMARY ==========");
console.log(`Imports OK     : ${okCount}`);
console.log(`Imports skipped: ${skipped} (already in DB)`);
console.log(`Imports failed : ${errors.length}`);
console.log(`Total products : ${totalProducts}`);

if (errors.length > 0) {
  console.log(`\n--- Errors ---`);
  for (const e of errors) {
    console.log(`  ${e.folder}: ${e.message}`);
  }
}
