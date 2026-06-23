import type { Lang } from "./i18n.js";

interface HelpSection {
  title: string;
  items: Array<{ label: string; description: string }>;
}

const FR: HelpSection[] = [
  {
    title: "📊 Tableau de bord — chaque case expliquée",
    items: [
      {
        label: "Imports historisés",
        description:
          "Nombre de packing lists Excel ingérés dans le catalogue (FAMI = Famiflora, TROPI = Tropi).",
      },
      {
        label: "Produits catalogués",
        description:
          "Total des lignes-produits dans la base. Le pourcentage indique combien ont un code EAN (utile pour le match exact lors d'un nouvel import).",
      },
      {
        label: "🟢 Codes validés par la douane",
        description:
          "Codes Tarabel extraits des PDF de déclarations douanières. Validés à 100% par la douane belge — c'est la vérité absolue.",
      },
      {
        label: "🟡 Codes estimés en interne",
        description:
          "Codes saisis à la main dans la colonne intrastat du packing list par ton équipe, sans validation douane. À confirmer.",
      },
      {
        label: "Codes uniques (douane)",
        description:
          "Nombre de codes Tarabel distincts utilisés en validation douane. Mesure la diversité du catalogue (familles de produits importées).",
      },
      {
        label: "Déclarations parsées",
        description:
          "Nombre de PDF de déclarations douanières extraits. Le sous-texte indique le total de lignes douanières (chaque PDF en contient 5-20, une par famille HS).",
      },
      {
        label: "EAN uniques",
        description:
          "Codes-barres distincts dans le catalogue. Plus le nombre de doublons (re-imports) est élevé, plus le lookup automatique sera efficace sur tes futurs imports.",
      },
      {
        label: "Divergence Chine ↔ Tarabel",
        description:
          "Sur les produits où on a les deux codes (chinois ET validé douane), pourcentage où ils diffèrent. Mesure objective de la fiabilité du fournisseur chinois. Calculé uniquement sur les codes validés douane (pas pollué par les estimations internes).",
      },
    ],
  },
  {
    title: "📋 Sections du bas",
    items: [
      {
        label: "Imports récents",
        description:
          "Les 8 derniers imports avec compte produits, codes douane (vert), estimations (jaune). 'Voir tous' amène à la page complète /imports.",
      },
      {
        label: "Top codes Tarabel",
        description:
          "Top 15 des codes les plus utilisés en validation douane. Donne les familles dominantes (fleurs, plastique, céramique...).",
      },
    ],
  },
  {
    title: "🎨 Code couleur des badges produits",
    items: [
      {
        label: "Badge vert 'Validé douane'",
        description:
          "Code extrait du PDF de déclaration → confiance maximale.",
      },
      {
        label: "Badge jaune 'Estimation interne'",
        description:
          "Code saisi par l'équipe dans le packing list → à reconfirmer avant utilisation.",
      },
    ],
  },
  {
    title: "🔍 Vérifier un import",
    items: [
      {
        label: "Comment ça marche",
        description:
          "Tu dépose le packing list Excel du fournisseur. L'app cherche chaque produit dans le catalogue historique : (1) match exact EAN → confiance haute, (2) match description chinoise → confiance moyenne, (3) sinon flag 'à classer'. Les codes validés douane sont prioritaires sur les estimations internes.",
      },
      {
        label: "Couleurs des résultats",
        description:
          "🟢 Vert = match EAN avec historique douane validé · 🟡 Jaune = match avec estimation interne uniquement · 🔴 Rouge = aucun match, à classifier manuellement.",
      },
      {
        label: "Export Excel enrichi",
        description:
          "Tu peux télécharger ton Excel d'origine avec la colonne intrastat remplie + 5 colonnes d'audit (code final, source, confiance, décision, note). Le code HS Chine apparaît en rouge si différent du Tarabel suggéré.",
      },
    ],
  },
];

const NL: HelpSection[] = [
  {
    title: "📊 Dashboard — elke kaart uitgelegd",
    items: [
      {
        label: "Geregistreerde imports",
        description:
          "Aantal Excel-paklijsten in de catalogus (FAMI = Famiflora, TROPI = Tropi).",
      },
      {
        label: "Gecatalogiseerde producten",
        description:
          "Totaal aantal productregels in de database. Het percentage geeft aan hoeveel een EAN-code hebben (handig voor exacte matching bij een nieuwe import).",
      },
      {
        label: "🟢 Door douane gevalideerde codes",
        description:
          "Tarabel-codes uit de douane-aangifte PDF's. 100% gevalideerd door de Belgische douane — de absolute waarheid.",
      },
      {
        label: "🟡 Intern geschatte codes",
        description:
          "Codes met de hand ingevuld in de intrastat-kolom van de paklijst door je team, zonder douanevalidatie. Te bevestigen.",
      },
      {
        label: "Unieke codes (douane)",
        description:
          "Aantal verschillende Tarabel-codes in de douanevalidatie. Meet de diversiteit van de catalogus.",
      },
      {
        label: "Geparste aangiftes",
        description:
          "Aantal succesvol verwerkte douane-aangifte PDF's. De subtekst toont het totaal aantal douaneregels.",
      },
      {
        label: "Unieke EAN's",
        description:
          "Verschillende barcodes in de catalogus. Hoe meer duplicaten (her-imports), hoe efficiënter de automatische opzoeking bij toekomstige imports.",
      },
      {
        label: "Divergentie China ↔ Tarabel",
        description:
          "Bij producten met beide codes, percentage waar ze verschillen. Objectieve maatstaf voor de betrouwbaarheid van de Chinese leverancier.",
      },
    ],
  },
  {
    title: "📋 Onderste secties",
    items: [
      {
        label: "Recente imports",
        description:
          "De 8 laatste imports met aantal producten, gevalideerde codes (groen), schattingen (geel).",
      },
      {
        label: "Top Tarabel-codes",
        description:
          "Top 15 meest gebruikte codes in douanevalidatie.",
      },
    ],
  },
  {
    title: "🎨 Kleurcodes van product-badges",
    items: [
      {
        label: "Groene badge 'Door douane gevalideerd'",
        description: "Code uit aangifte-PDF → maximaal vertrouwen.",
      },
      {
        label: "Gele badge 'Interne schatting'",
        description: "Code ingevuld door team in paklijst → te herbevestigen.",
      },
    ],
  },
  {
    title: "🔍 Import verifiëren",
    items: [
      {
        label: "Hoe het werkt",
        description:
          "Sleep het Excel paklijst van de leverancier. De app zoekt elk product in de historische catalogus: (1) exacte EAN-match → hoog vertrouwen, (2) Chinese omschrijving match → middelmatig, (3) anders 'te klasseren'.",
      },
      {
        label: "Kleur van resultaten",
        description:
          "🟢 Groen = EAN-match met gevalideerde douane-historiek · 🟡 Geel = match met alleen interne schatting · 🔴 Rood = geen match, handmatig te klasseren.",
      },
      {
        label: "Verrijkt Excel-export",
        description:
          "Download je originele Excel met ingevulde intrastat-kolom + 5 audit-kolommen.",
      },
    ],
  },
];

export function renderHelpContent(lang: Lang): string {
  const sections = lang === "nl" ? NL : FR;
  return sections
    .map(
      (s) => `
    <section class="mb-6">
      <h2 class="font-bold text-lg mb-3">${s.title}</h2>
      <dl class="space-y-3">
        ${s.items
          .map(
            (i) => `
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 border-b border-slate-100 pb-2">
            <dt class="font-medium text-slate-800">${i.label}</dt>
            <dd class="md:col-span-2 text-sm text-slate-600">${i.description}</dd>
          </div>
        `,
          )
          .join("")}
      </dl>
    </section>
  `,
    )
    .join("");
}

export function helpButtonAndModal(lang: Lang): string {
  const title = lang === "fr" ? "Mode d'emploi" : "Handleiding";
  const close = lang === "fr" ? "Fermer" : "Sluiten";
  return `
    <button type="button" onclick="document.getElementById('help-modal').classList.remove('hidden')" class="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700" title="${title}">? ${title}</button>
    <div id="help-modal" class="hidden fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-lg shadow-2xl max-w-3xl w-full my-8">
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-lg">
          <h1 class="text-xl font-bold">${title}</h1>
          <button type="button" onclick="document.getElementById('help-modal').classList.add('hidden')" class="text-sm px-3 py-1 rounded border border-slate-300 hover:bg-slate-100">${close} ✕</button>
        </div>
        <div class="px-6 py-4">
          ${renderHelpContent(lang)}
        </div>
      </div>
    </div>
  `;
}
