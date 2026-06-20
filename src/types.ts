export type Confidence = "high" | "medium" | "low";

export interface ProductRow {
  rowIndex: number;
  leverancier: string;
  chineseDescription: string;
  englishDescription: string;
  omschrijving: string;
  descriptionNL: string;
  descriptionFR: string;
  hsCodeChina: string;
  eanBarcode: string;
  bestelnummer: string;
  quantity: number | null;
  priceUSD: number | null;
  material: string;
  imageBuffer?: Buffer;
  imageExt?: string;
}

export interface ClassificationResult {
  tarabelCode: string;
  invoerRate: number | null;
  confidence: Confidence;
  justification: string;
  materialConfirmed: boolean;
  materialNote: string;
  divergesFromChina: boolean;
  needsManualReview: boolean;
}

export interface EnrichedRow extends ProductRow {
  classification: ClassificationResult | { error: string };
}
