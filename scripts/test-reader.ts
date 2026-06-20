import { loadWorkbook } from "../src/excel/reader.js";

const path = process.argv[2] ?? "C:/Users/jimmy.hendrickx/Downloads/ex.xlsx";
const { rows } = await loadWorkbook(path);

console.log(`Total produits : ${rows.length}`);
console.log(`Avec image     : ${rows.filter((r) => r.imageBuffer).length}`);
console.log(`Avec HS chinois: ${rows.filter((r) => r.hsCodeChina).length}`);
console.log(`Avec material  : ${rows.filter((r) => r.material).length}`);

console.log("\n=== Échantillon des 5 premiers produits ===");
for (const r of rows.slice(0, 5)) {
  console.log(`\nRow ${r.rowIndex}:`);
  console.log(`  CH: ${r.chineseDescription}`);
  console.log(`  EN: ${r.englishDescription}`);
  console.log(`  NL: ${r.descriptionNL || r.omschrijving}`);
  console.log(`  FR: ${r.descriptionFR}`);
  console.log(`  HS chinois: ${r.hsCodeChina}`);
  console.log(`  Material: ${r.material}`);
  console.log(`  Price: ${r.priceUSD} USD, Qty: ${r.quantity}`);
  console.log(
    `  Image: ${r.imageBuffer ? `${r.imageBuffer.length} bytes (${r.imageExt})` : "AUCUNE"}`,
  );
}
