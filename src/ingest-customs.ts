import path from "node:path";
import { ingestAllCustoms } from "./customs/ingest.js";

const parentDir =
  process.argv[2] ?? "C:\\Users\\jimmy.hendrickx\\Desktop\\Nouveau dossier";
const dbPath =
  process.argv[3] ?? path.join(process.cwd(), "catalog", "catalog.db");

console.log(`Parent dir: ${parentDir}`);
console.log(`Database  : ${dbPath}\n`);

const stats = await ingestAllCustoms(parentDir, dbPath);

const ok = stats.filter((s) => s.status === "ok");
const noPdf = stats.filter((s) => s.status === "no_pdf");
const noLines = stats.filter((s) => s.status === "no_lines");
const errors = stats.filter((s) => s.status === "error");
const skipped = stats.filter((s) => s.status === "skipped");

const totalLines = ok.reduce((s, x) => s + x.lineCount, 0);
const totalMatched = ok.reduce((s, x) => s + x.matchedProducts, 0);

const fmtCounts = new Map<string, number>();
for (const s of ok) {
  if (s.format) fmtCounts.set(s.format, (fmtCounts.get(s.format) ?? 0) + 1);
}

console.log("\n========== CUSTOMS INGEST SUMMARY ==========");
console.log(`Imports OK            : ${ok.length}`);
console.log(`Imports skipped       : ${skipped.length} (already parsed)`);
console.log(`Imports without PDF   : ${noPdf.length}`);
console.log(`Imports w/o extractable lines: ${noLines.length}`);
console.log(`Imports failed        : ${errors.length}`);
console.log(`\nTotal customs lines  : ${totalLines}`);
console.log(`Products matched      : ${totalMatched}`);
console.log(`\nBy format:`);
for (const [f, c] of fmtCounts) console.log(`  ${f}: ${c}`);

if (errors.length > 0) {
  console.log(`\n--- Errors ---`);
  for (const e of errors) console.log(`  ${e.folder}: ${e.message}`);
}
if (noLines.length > 0) {
  console.log(`\n--- No lines extracted ---`);
  for (const e of noLines) console.log(`  ${e.folder} (format ${e.format})`);
}
