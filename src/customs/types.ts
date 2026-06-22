export type CustomsFormat = "IDMS" | "PLDA_SAD" | "ATT_FIELDS" | "UNKNOWN";

export interface CustomsLine {
  lineNumber: number;
  hsCode: string;
  description?: string;
  grossMass?: number;
  netMass?: number;
  statisticalValue?: number;
  dutyRate?: number;
  dutyAmount?: number;
  vatRate?: number;
  rawBlock?: string;
}

export interface CustomsDeclaration {
  format: CustomsFormat;
  mrn?: string;
  acceptanceDate?: string;
  lines: CustomsLine[];
  rawText: string;
}
