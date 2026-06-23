import Database from "better-sqlite3";
const db = new Database("catalog/catalog.db");

const imp = db.prepare("SELECT * FROM imports WHERE folder_name = '26FAMI05'").get() as any;
console.log("Import:", imp);

const decl = db.prepare("SELECT * FROM customs_declarations WHERE import_id = ?").get(imp.id) as any;
console.log("\nDeclaration:", decl ? { id: decl.id, format: decl.format, line_count: decl.line_count } : "none");

if (decl) {
  const lines = db.prepare("SELECT line_number, hs_code, description FROM customs_lines WHERE declaration_id = ?").all(decl.id);
  console.log(`\n${lines.length} customs lines:`);
  for (const l of lines as any[]) console.log(`  #${l.line_number}: ${l.hs_code} - ${(l.description || "").slice(0, 60)}`);
}

const products = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN tarabel_source = 'customs_pdf' THEN 1 ELSE 0 END) AS customs,
    SUM(CASE WHEN tarabel_validated IS NOT NULL AND tarabel_validated != '' AND (tarabel_source IS NULL OR tarabel_source != 'customs_pdf') THEN 1 ELSE 0 END) AS packing,
    SUM(CASE WHEN hs_china IS NOT NULL AND hs_china != '' THEN 1 ELSE 0 END) AS has_china
  FROM products WHERE import_id = ?
`).get(imp.id);
console.log("\nProduct stats:", products);

console.log("\n--- 5 products with chinese HS + their stored tarabel ---");
const sample = db.prepare("SELECT id, hs_china, tarabel_validated, tarabel_source FROM products WHERE import_id = ? AND hs_china IS NOT NULL LIMIT 5").all(imp.id);
console.table(sample);
