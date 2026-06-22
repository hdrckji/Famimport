import type { CustomsDeclaration, CustomsLine } from "../types.js";

const NUM = (s: string | undefined): number | undefined => {
  if (s == null) return undefined;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function parseAttFields(text: string): CustomsDeclaration {
  const decl: CustomsDeclaration = {
    format: "ATT_FIELDS",
    lines: [],
    rawText: text,
  };

  decl.mrn = text.match(/\b(\d{2}BEH\w{14})\b/)?.[1];
  decl.acceptanceDate = text.match(/Datum van aanvaarding[:\s]+(\d{8})/i)?.[1];

  // Split into per-item blocks. Each item starts at "[11 03] Artikelnummer:" and ends before the next.
  const splits = text.split(/\[11 03\]\s*Artikelnummer:/);
  for (let i = 1; i < splits.length; i++) {
    const block = splits[i];
    // Description is captured between "[18 05] Omschrijving van de goederen:" and "[13 01] Exporteur:"
    const descMatch = block.match(
      /\[18 05\]\s*Omschrijving van de goederen:\s*(\d+)\s+([\s\S]+?)\s*\[13 01\]/,
    );
    if (!descMatch) continue;
    const lineNumber = Number(descMatch[1]);
    const description = descMatch[2].replace(/\s+/g, " ").trim();

    // Labels can be inlined: "[18 09 056] Code onderverdeling GS: [18 09 57] Code gecombineerde nomenclatuur: 220210 00"
    // → GS=220210, CN=00. Capture both together after the two labels.
    const gsCn = block.match(
      /\[18 09 056\]\s*Code onderverdeling GS:\s*(?:\[18 09 57\][^:]*:\s*)?(\d{6})\s+(\d{2})/i,
    );
    const gs = gsCn?.[1];
    const cn = gsCn?.[2] ?? "00";

    // TARIC: "[18 09 58] TARIC-code: 00" — value is exactly 2 digits after the colon
    const taric = block.match(/\[18 09 58\]\s*TARIC-code:\s*(\d{2})(?!\d)/)?.[1] ?? "00";
    if (!gs) continue;
    const hsCode = gs + cn + taric;

    const grossMass = NUM(block.match(/\[18 04\]\s*Brutomassa:\s*([\d.,]+)/i)?.[1]);
    const netMass = NUM(block.match(/\[18 01\]\s*Nettomassa:\s*([\d.,]+)/i)?.[1]);
    const statValue = NUM(block.match(/\[99 06\]\s*Statistische waarde:[^]*?([\d.,]+)\s*\[/)?.[1]);

    // The rate table is messy — line "A00 40924.31 4.7 1923.44" or similar
    const a00 = block.match(/A00\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/);
    const dutyRate = NUM(a00?.[2]);
    const dutyAmount = NUM(a00?.[3]);
    const b00 = block.match(/B00\s+([\d.,]+)\s+([\d.,]+)/);
    const vatRate = NUM(b00?.[2]);

    decl.lines.push({
      lineNumber,
      hsCode,
      description,
      grossMass,
      netMass,
      statisticalValue: statValue,
      dutyRate,
      dutyAmount,
      vatRate,
      rawBlock: block.slice(0, 800),
    });
  }
  return decl;
}
