export const SHEET_NAME = "creatie";
export const HEADER_ROW = 1;
export const NOTES_ROW = 2;
export const DATA_START_ROW = 3;

export const COL = {
  leverancier: 1,
  photos: 2,
  chineseDescription: 3,
  englishDescription: 4,
  omschrijving: 5,
  descriptionNL: 6,
  descriptionFR: 7,
  hsCodeChina: 8,
  intrastat: 9,
  invoerPct: 10,
  eanBarcode: 11,
  bestelnummer: 12,
  quantity: 16,
  priceUSD: 17,
  material: 28,
} as const;

export const AUDIT_COLS = {
  confidence: 51,
  justification: 52,
  needsReview: 53,
  materialConfirmed: 54,
  materialNote: 55,
  divergesFromChina: 56,
} as const;

export const AUDIT_HEADERS: Array<[number, string]> = [
  [AUDIT_COLS.confidence, "Claude: confidence"],
  [AUDIT_COLS.justification, "Claude: justification"],
  [AUDIT_COLS.needsReview, "Claude: needs manual review"],
  [AUDIT_COLS.materialConfirmed, "Claude: material confirmed"],
  [AUDIT_COLS.materialNote, "Claude: material note"],
  [AUDIT_COLS.divergesFromChina, "Claude: diverges from China HS"],
];
