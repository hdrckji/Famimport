import Database from "better-sqlite3";
const db = new Database("catalog/catalog.db");

const overall = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN tarabel_validated IS NOT NULL AND tarabel_validated != '' THEN 1 ELSE 0 END) AS with_code,
    SUM(CASE WHEN tarabel_source = 'customs_pdf' THEN 1 ELSE 0 END) AS from_pdf,
    SUM(CASE WHEN tarabel_validated IS NOT NULL AND tarabel_validated != ''
              AND (tarabel_source IS NULL OR tarabel_source != 'customs_pdf') THEN 1 ELSE 0 END) AS from_packing
  FROM products
`).get();
console.log("OVERALL:", overall);

const byYear = db.prepare(`
  SELECT i.year,
         COUNT(*) AS total,
         SUM(CASE WHEN p.tarabel_source = 'customs_pdf' THEN 1 ELSE 0 END) AS from_pdf,
         SUM(CASE WHEN p.tarabel_validated IS NOT NULL AND p.tarabel_validated != ''
                   AND (p.tarabel_source IS NULL OR p.tarabel_source != 'customs_pdf') THEN 1 ELSE 0 END) AS from_packing
  FROM products p JOIN imports i ON p.import_id = i.id
  GROUP BY i.year ORDER BY i.year
`).all();
console.log("\nBY YEAR:");
console.table(byYear);
