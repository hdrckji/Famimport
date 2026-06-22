import type { CustomsDeclaration, CustomsLine } from "../types.js";

const NUM = (s: string | undefined): number | undefined => {
  if (s == null) return undefined;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function parseIdms(text: string): CustomsDeclaration {
  const decl: CustomsDeclaration = {
    format: "IDMS",
    lines: [],
    rawText: text,
  };

  const mrn = text.match(/\b(\d{2}BEH\w{14}|\d{2}BEI\w{14})\b/)?.[1];
  if (mrn) decl.mrn = mrn;
  const date = text.match(/Acceptance date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1];
  if (date) decl.acceptanceDate = date;

  const itemRegex = /Item:\s*(\d+)\s+([\s\S]*?)(?=Item:\s*\d+|$)/g;
  let m;
  while ((m = itemRegex.exec(text)) !== null) {
    const lineNumber = Number(m[1]);
    const block = m[2];
    const commodityCode = block.match(/Commodity code\s*:?\s*(\d{8,10})/i)?.[1];
    if (!commodityCode) continue;

    let hs10 = commodityCode;
    if (hs10.length === 8) hs10 = hs10 + "00";

    const grossMass = NUM(block.match(/Gross mass[:\s]+([\d.,]+)/i)?.[1]);
    const netMass = NUM(block.match(/Net mass[:\s]+([\d.,]+)/i)?.[1]);

    const descMatch = block.match(/Commodity code\s*:?\s*\d+\s+([^\n]+?)(?:Additional information|Documents|Previous documents|Preference|Equipment|$)/i);
    const description = descMatch?.[1]?.trim();

    const a00Match = block.match(/A00\s+([\d.,]+)\s+([\d.,]+)/);
    const statisticalValue = NUM(a00Match?.[1]);
    const dutyRate = NUM(a00Match?.[2]);
    const dutyAmount = NUM(block.match(/A00\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)/)?.[1]);
    const b00Match = block.match(/B00\s+[\d.,]+\s+([\d.,]+)/);
    const vatRate = NUM(b00Match?.[1]);

    const line: CustomsLine = {
      lineNumber,
      hsCode: hs10,
      description,
      grossMass,
      netMass,
      statisticalValue,
      dutyRate,
      dutyAmount,
      vatRate,
      rawBlock: block.slice(0, 800),
    };
    decl.lines.push(line);
  }
  return decl;
}
