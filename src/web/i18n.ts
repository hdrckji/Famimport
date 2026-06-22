export type Lang = "fr" | "nl";

const MATERIAL_BASE: Record<string, { fr: string; nl: string }> = {
  "塑料": { fr: "plastique", nl: "kunststof" },
  "塑胶": { fr: "plastique souple", nl: "zacht plastic" },
  "陶瓷": { fr: "céramique", nl: "keramiek" },
  "陶": { fr: "terre cuite", nl: "aardewerk" },
  "铁": { fr: "fer", nl: "ijzer" },
  "铁皮": { fr: "tôle", nl: "plaatijzer" },
  "玻璃": { fr: "verre", nl: "glas" },
  "树脂": { fr: "résine", nl: "hars" },
  "涤": { fr: "polyester", nl: "polyester" },
  "涤纶": { fr: "polyester", nl: "polyester" },
  "棉": { fr: "coton", nl: "katoen" },
  "橡胶": { fr: "caoutchouc", nl: "rubber" },
  "纸": { fr: "papier", nl: "papier" },
  "竹": { fr: "bambou", nl: "bamboe" },
  "木": { fr: "bois", nl: "hout" },
  "泡沫": { fr: "mousse", nl: "schuim" },
  "密度板": { fr: "MDF", nl: "MDF" },
  "布": { fr: "tissu", nl: "stof" },
  "无纺布": { fr: "non-tissé", nl: "non-woven" },
  "马赛克": { fr: "mosaïque", nl: "mozaïek" },
  "皮": { fr: "cuir", nl: "leder" },
  "PU皮": { fr: "simili cuir PU", nl: "PU leder" },
  "石头": { fr: "pierre", nl: "steen" },
  "石": { fr: "pierre", nl: "steen" },
  "金属": { fr: "métal", nl: "metaal" },
  "不锈钢": { fr: "acier inoxydable", nl: "roestvrij staal" },
  "钢": { fr: "acier", nl: "staal" },
  "铝": { fr: "aluminium", nl: "aluminium" },
  "铜": { fr: "cuivre", nl: "koper" },
  "羊毛": { fr: "laine", nl: "wol" },
  "麻": { fr: "lin/chanvre", nl: "linnen/hennep" },
  "草藤": { fr: "rotin/paille", nl: "rotan/stro" },
  "草": { fr: "paille", nl: "stro" },
  "藤": { fr: "rotin", nl: "rotan" },
  "聚酯": { fr: "polyester", nl: "polyester" },
  "尼龙": { fr: "nylon", nl: "nylon" },
  "亚克力": { fr: "acrylique", nl: "acryl" },
  "硅胶": { fr: "silicone", nl: "silicone" },
  "丝": { fr: "soie", nl: "zijde" },
  "PVC": { fr: "PVC", nl: "PVC" },
  "PU": { fr: "polyuréthane", nl: "polyurethaan" },
  "PP": { fr: "polypropylène", nl: "polypropyleen" },
  "PE": { fr: "polyéthylène", nl: "polyethyleen" },
  "ABS": { fr: "ABS", nl: "ABS" },
  "TPR": { fr: "TPR", nl: "TPR" },
  "EVA": { fr: "EVA", nl: "EVA" },
  "MDF": { fr: "MDF", nl: "MDF" },
  "IRON": { fr: "fer", nl: "ijzer" },
  "POLYESTER": { fr: "polyester", nl: "polyester" },
  "PLASTIC": { fr: "plastique", nl: "kunststof" },
  "ALUMINUM": { fr: "aluminium", nl: "aluminium" },
  "STEEL": { fr: "acier", nl: "staal" },
};

function tokenize(material: string): string[] {
  return material
    .split(/[+＋,，/／、]| AND |\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function translateMaterial(raw: string | null | undefined, lang: Lang): string | null {
  if (!raw) return null;
  const tokens = tokenize(raw);
  if (tokens.length === 0) return null;
  const translated = tokens.map((t) => {
    const upper = t.toUpperCase();
    const exact = MATERIAL_BASE[t] ?? MATERIAL_BASE[upper];
    if (exact) return exact[lang];
    for (const [zh, tr] of Object.entries(MATERIAL_BASE)) {
      if (t.includes(zh)) return tr[lang];
    }
    return t;
  });
  return translated.join(" + ");
}

interface UIStrings {
  navDashboard: string;
  navImports: string;
  navProducts: string;
  navUpload: string;
  navHistory: string;
  dashboardTitle: string;
  cardImports: string;
  cardImportsSub: string;
  cardProducts: string;
  cardProductsSubWithEan: string;
  cardTarabel: string;
  cardTarabelSub: string;
  cardUniqueCodes: string;
  cardUniqueCodesSub: string;
  cardDeclarations: string;
  cardDeclarationsSub: string;
  cardUniqueEans: string;
  cardUniqueEansSub: string;
  cardDivergence: string;
  cardDivergenceSub: string;
  recentImports: string;
  seeAll: string;
  topCodes: string;
  uses: string;
  importsTitle: string;
  folder: string;
  year: string;
  brand: string;
  products: string;
  tarabelCoverage: string;
  customsPdf: string;
  sheet: string;
  validated: string;
  importDetailHint: string;
  searchPlaceholder: string;
  eanPlaceholder: string;
  hsCodePlaceholder: string;
  allBrands: string;
  allYears: string;
  validatedOnly: string;
  filter: string;
  description: string;
  material: string;
  hsChina: string;
  tarabel: string;
  invoer: string;
  priceUsd: string;
  quantity: string;
  detail: string;
  catalogTitle: string;
  productsCount: string;
  page: string;
  previous: string;
  next: string;
  noDescription: string;
  noPhoto: string;
  ean: string;
  import: string;
  productHistory: string;
  productHistoryWarning: string;
  source: string;
  back: string;
  backToImports: string;
  backToCatalog: string;
  source_packing: string;
  source_customs: string;
  reImportsDup: string;
}

const FR: UIStrings = {
  navDashboard: "Tableau de bord",
  navImports: "Imports passés",
  navProducts: "Catalogue",
  navUpload: "Vérifier un import",
  navHistory: "Mes vérifications",
  dashboardTitle: "Tableau de bord",
  cardImports: "Imports historisés",
  cardImportsSub: "Avec data dans la BDD",
  cardProducts: "Produits catalogués",
  cardProductsSubWithEan: "avec EAN",
  cardTarabel: "Codes Tarabel validés",
  cardTarabelSub: "du catalogue",
  cardUniqueCodes: "Codes uniques utilisés",
  cardUniqueCodesSub: "Diversité du catalogue",
  cardDeclarations: "Déclarations parsées",
  cardDeclarationsSub: "lignes douanières",
  cardUniqueEans: "EAN uniques",
  cardUniqueEansSub: "doublons (re-imports)",
  cardDivergence: "Divergence Chine ↔ Tarabel",
  cardDivergenceSub: "Sur produits où on a les 2 codes",
  recentImports: "Imports récents",
  seeAll: "Voir tous →",
  topCodes: "Top codes Tarabel",
  uses: "Utilisations",
  importsTitle: "Imports",
  folder: "Dossier",
  year: "Année",
  brand: "Marque",
  products: "Produits",
  tarabelCoverage: "Couverture Tarabel",
  customsPdf: "PDF douane",
  sheet: "Onglet",
  validated: "Validés",
  importDetailHint: "produits",
  searchPlaceholder: "Recherche descriptions...",
  eanPlaceholder: "EAN",
  hsCodePlaceholder: "Code HS (préfixe ok)",
  allBrands: "Toutes marques",
  allYears: "Toutes années",
  validatedOnly: "Validés seulement",
  filter: "Filtrer",
  description: "Description",
  material: "Matériau",
  hsChina: "HS Chine",
  tarabel: "Tarabel",
  invoer: "% droits",
  priceUsd: "Prix USD",
  quantity: "Quantité",
  detail: "détail",
  catalogTitle: "Catalogue",
  productsCount: "produits",
  page: "Page",
  previous: "← Précédent",
  next: "Suivant →",
  noDescription: "(pas de description)",
  noPhoto: "Pas de photo",
  ean: "EAN",
  import: "Import",
  productHistory: "Historique de ce produit",
  productHistoryWarning: "Ce produit a déjà été classé sous",
  source: "Source",
  back: "←",
  backToImports: "← Imports",
  backToCatalog: "← Catalogue",
  source_packing: "packing list",
  source_customs: "PDF douane",
  reImportsDup: "doublons (re-imports)",
};

const NL: UIStrings = {
  navDashboard: "Dashboard",
  navImports: "Vorige imports",
  navProducts: "Catalogus",
  navUpload: "Import verifiëren",
  navHistory: "Mijn verificaties",
  dashboardTitle: "Dashboard",
  cardImports: "Geregistreerde imports",
  cardImportsSub: "Met data in de DB",
  cardProducts: "Gecatalogiseerde producten",
  cardProductsSubWithEan: "met EAN",
  cardTarabel: "Gevalideerde Tarabel-codes",
  cardTarabelSub: "van de catalogus",
  cardUniqueCodes: "Unieke codes gebruikt",
  cardUniqueCodesSub: "Diversiteit van de catalogus",
  cardDeclarations: "Geparste aangiftes",
  cardDeclarationsSub: "douaneregels",
  cardUniqueEans: "Unieke EAN's",
  cardUniqueEansSub: "duplicaten (her-imports)",
  cardDivergence: "Divergentie China ↔ Tarabel",
  cardDivergenceSub: "Op producten met beide codes",
  recentImports: "Recente imports",
  seeAll: "Alle bekijken →",
  topCodes: "Top Tarabel-codes",
  uses: "Gebruik",
  importsTitle: "Imports",
  folder: "Map",
  year: "Jaar",
  brand: "Merk",
  products: "Producten",
  tarabelCoverage: "Tarabel-dekking",
  customsPdf: "Douane-PDF",
  sheet: "Tabblad",
  validated: "Gevalideerd",
  importDetailHint: "producten",
  searchPlaceholder: "Zoek omschrijvingen...",
  eanPlaceholder: "EAN",
  hsCodePlaceholder: "HS-code (prefix ok)",
  allBrands: "Alle merken",
  allYears: "Alle jaren",
  validatedOnly: "Alleen gevalideerd",
  filter: "Filteren",
  description: "Omschrijving",
  material: "Materiaal",
  hsChina: "HS China",
  tarabel: "Tarabel",
  invoer: "% rechten",
  priceUsd: "Prijs USD",
  quantity: "Hoeveelheid",
  detail: "detail",
  catalogTitle: "Catalogus",
  productsCount: "producten",
  page: "Pagina",
  previous: "← Vorige",
  next: "Volgende →",
  noDescription: "(geen omschrijving)",
  noPhoto: "Geen foto",
  ean: "EAN",
  import: "Import",
  productHistory: "Geschiedenis van dit product",
  productHistoryWarning: "Dit product is al geclassificeerd onder",
  source: "Bron",
  back: "←",
  backToImports: "← Imports",
  backToCatalog: "← Catalogus",
  source_packing: "paklijst",
  source_customs: "Douane-PDF",
  reImportsDup: "duplicaten (her-imports)",
};

export function t(lang: Lang): UIStrings {
  return lang === "nl" ? NL : FR;
}
