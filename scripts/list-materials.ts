import Database from "better-sqlite3";
const db = new Database("catalog/catalog.db", { readonly: true });
const rows = db.prepare(`
  SELECT material, COUNT(*) AS n
  FROM products
  WHERE material IS NOT NULL AND material != ''
  GROUP BY material
  ORDER BY n DESC
`).all() as Array<{ material: string; n: number }>;
console.log(`Unique materials: ${rows.length}`);
console.log(`Top 40:`);
for (const r of rows.slice(0, 40)) console.log(`  ${r.n.toString().padStart(4)}× ${r.material}`);
console.log(`\nTotal products with material: ${rows.reduce((s, r) => s + r.n, 0)}`);
const top40Sum = rows.slice(0, 40).reduce((s, r) => s + r.n, 0);
console.log(`Top 40 cover: ${top40Sum} (${Math.round(top40Sum / rows.reduce((s, r) => s + r.n, 0) * 100)}%)`);
