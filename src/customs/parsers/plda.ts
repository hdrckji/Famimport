import type { CustomsDeclaration, CustomsLine } from "../types.js";

const NUM = (s: string | undefined): number | undefined => {
  if (s == null) return undefined;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function parsePldaSad(pages: string[]): CustomsDeclaration {
  const decl: CustomsDeclaration = {
    format: "PLDA_SAD",
    lines: [],
    rawText: pages.join("\n"),
  };

  decl.mrn = decl.rawText.match(/\b(\d{2}BEI\w{14})\b/)?.[1];

  let lineCounter = 0;
  for (const text of pages) {
    const codeMatches = [...text.matchAll(/\b(\d{8})\s+(\d{2})\s+ZEEBRUGGE\b/g)];
    if (codeMatches.length === 0) continue;

    for (const codeMatch of codeMatches) {
      lineCounter++;
      const hsCode = codeMatch[1] + codeMatch[2];

      const idx = codeMatch.index ?? 0;
      const before = text.slice(Math.max(0, idx - 1500), idx);

      const descMatch = before.match(/PK[-\s]Verpakking\s+(.+?)\s+CN\s/i);
      const description = descMatch?.[1]?.trim().replace(/\s+/g, " ");

      const massMatch = before.match(/CN\s+([\d.,]+)\s+([\d.,]+)/);
      const grossMass = NUM(massMatch?.[1]);
      const netMass = NUM(massMatch?.[2]);

      const a00Match = before.match(/A00\s+([\d.,]+)\s+([\d.,]+)%\s+([\d.,]+)/);
      const statisticalValue = NUM(a00Match?.[1]);
      const dutyRate = NUM(a00Match?.[2]);
      const dutyAmount = NUM(a00Match?.[3]);
      const b00Match = before.match(/B00\s+[\d.,]+\s+([\d.,]+)%/);
      const vatRate = NUM(b00Match?.[1]);

      decl.lines.push({
        lineNumber: lineCounter,
        hsCode,
        description,
        grossMass,
        netMass,
        statisticalValue,
        dutyRate,
        dutyAmount,
        vatRate,
        rawBlock: before.slice(-600),
      });
    }
  }
  return decl;
}
