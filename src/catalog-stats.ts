import Database from "better-sqlite3";
import path from "node:path";

const dbPath = process.argv[2] ?? path.join(process.cwd(), "catalog", "catalog.db");
const db = new Database(dbPath, { readonly: true });

const totalImports = (db.prepare("SELECT COUNT(*) AS c FROM imports").get() as { c: number }).c;
const totalProducts = (db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c;

console.log(`\n========== CATALOG STATS ==========`);
console.log(`Imports: ${totalImports}, Products: ${totalProducts}\n`);

console.log("--- Imports per year ---");
const yearStats = db.prepare(`
  SELECT year, brand, COUNT(*) AS imports, SUM(product_count) AS products
  FROM imports
  GROUP BY year, brand
  ORDER BY year, brand
`).all() as Array<{ year: number; brand: string; imports: number; products: number }>;
console.table(yearStats);

console.log("\n--- Field coverage (% of products with data) ---");
const fields = [
  ["EAN", "ean"],
  ["English desc", "english_description"],
  ["Chinese desc", "chinese_description"],
  ["NL desc", "nl_description"],
  ["FR desc", "fr_description"],
  ["HS code (Chine)", "hs_china"],
  ["Tarabel (validé)", "tarabel_validated"],
  ["%invoer", "invoer_pct"],
  ["Material", "material"],
  ["Photo", "photo_path"],
  ["Prix USD", "price_usd"],
];
const coverage = fields.map(([label, col]) => {
  const c = (db.prepare(
    `SELECT COUNT(*) AS c FROM products WHERE ${col} IS NOT NULL AND ${col} != ''`,
  ).get() as { c: number }).c;
  return { Field: label, Filled: c, Pct: ((c / totalProducts) * 100).toFixed(1) + "%" };
});
console.table(coverage);

console.log("\n--- Coverage of validated Tarabel by year ---");
const tarabelByYear = db.prepare(`
  SELECT i.year,
         COUNT(*) AS total,
         SUM(CASE WHEN p.tarabel_validated IS NOT NULL AND p.tarabel_validated != '' THEN 1 ELSE 0 END) AS with_tarabel
  FROM products p JOIN imports i ON p.import_id = i.id
  GROUP BY i.year ORDER BY i.year
`).all() as Array<{ year: number; total: number; with_tarabel: number }>;
console.table(tarabelByYear.map((r) => ({
  Year: r.year,
  Total: r.total,
  "With Tarabel": r.with_tarabel,
  "%": ((r.with_tarabel / r.total) * 100).toFixed(0) + "%",
})));

console.log("\n--- Top 10 most-used Tarabel codes ---");
const topCodes = db.prepare(`
  SELECT tarabel_validated AS code, COUNT(*) AS uses
  FROM products
  WHERE tarabel_validated IS NOT NULL AND tarabel_validated != ''
  GROUP BY tarabel_validated
  ORDER BY uses DESC LIMIT 10
`).all();
console.table(topCodes);

console.log("\n--- EAN duplicates (same product across imports) ---");
const dupEAN = db.prepare(`
  SELECT COUNT(*) AS unique_eans,
         SUM(CASE WHEN n > 1 THEN n ELSE 0 END) AS rows_with_dup,
         MAX(n) AS max_occurrences
  FROM (SELECT ean, COUNT(*) AS n FROM products WHERE ean IS NOT NULL AND ean != '' GROUP BY ean)
`).get();
console.log(dupEAN);

console.log("\n--- Top 10 most-imported EANs ---");
const topEAN = db.prepare(`
  SELECT p.ean,
         COUNT(DISTINCT p.import_id) AS num_imports,
         GROUP_CONCAT(DISTINCT p.tarabel_validated) AS codes_used,
         MAX(p.english_description) AS sample_desc
  FROM products p
  WHERE p.ean IS NOT NULL AND p.ean != ''
  GROUP BY p.ean
  ORDER BY num_imports DESC
  LIMIT 10
`).all();
console.table(topEAN);

console.log("\n--- HS chinois vs Tarabel divergence (where both present) ---");
const divergence = db.prepare(`
  SELECT COUNT(*) AS total,
         SUM(CASE WHEN hs_china = tarabel_validated THEN 1 ELSE 0 END) AS matching,
         SUM(CASE WHEN hs_china != tarabel_validated THEN 1 ELSE 0 END) AS diverging
  FROM products
  WHERE hs_china IS NOT NULL AND hs_china != ''
    AND tarabel_validated IS NOT NULL AND tarabel_validated != ''
`).get() as { total: number; matching: number; diverging: number };
console.log(divergence, `→ ${((divergence.diverging / divergence.total) * 100).toFixed(1)}% divergence`);

db.close();
