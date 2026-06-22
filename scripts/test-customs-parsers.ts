import { parseCustomsPdf } from "../src/customs/parse.js";

const samples = [
  ["IDMS", "C:/Users/jimmy.hendrickx/Desktop/Nouveau dossier/25FAMI12/Att. No. 1 IDMS-IAD-ID-2025-00000485_24138382.pdf"],
  ["ATT_FIELDS", "C:/Users/jimmy.hendrickx/Desktop/Nouveau dossier/26FAMI01/1.pdf"],
  ["PLDA_SAD", "C:/Users/jimmy.hendrickx/Desktop/Nouveau dossier/24FAMI02/Att. No. 1 IMA NIEUW.pdf"],
];

for (const [expected, pdf] of samples) {
  console.log(`\n========== ${expected} : ${pdf.split("/").pop()} ==========`);
  const decl = await parseCustomsPdf(pdf);
  if (!decl) {
    console.log("❌ Parse failed");
    continue;
  }
  console.log(`Format detected: ${decl.format}`);
  console.log(`MRN: ${decl.mrn ?? "(none)"}`);
  console.log(`Date: ${decl.acceptanceDate ?? "(none)"}`);
  console.log(`Lines extracted: ${decl.lines.length}`);
  for (const line of decl.lines) {
    console.log(`  #${line.lineNumber}: HS=${line.hsCode}  rate=${line.dutyRate}%  net=${line.netMass}kg  desc="${(line.description ?? "").slice(0, 60)}"`);
  }
}
