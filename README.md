# Famimport

Outil de vérification et correction des codes HS (**Tarabel 10 chiffres**) pour les imports Chine → Belgique.

## Problème

Les fournisseurs chinois communiquent leurs produits dans un fichier Excel contenant :
- Photo, descriptions multilingues (ZH/EN/NL/FR)
- Code HS proposé (faux ~1 fois sur 2)
- Matériaux en chinois (parfois faux)
- Prix USD, quantités

L'objectif est de vérifier/corriger automatiquement chaque ligne via Claude (vision + descriptions + matériaux) et de produire un Excel enrichi prêt pour la déclaration douanière.

## Installation

```powershell
npm install
copy .env.example .env
# éditer .env pour mettre la clé ANTHROPIC_API_KEY
```

## Utilisation

### Mode simple (sans IDE)

**Glisser-déposer** ton fichier Excel sur `Famimport.bat`. Le résultat apparaît dans le dossier `output\` avec un timestamp.

Ou double-clique `Famimport.bat` et tape le chemin du fichier.

### Mode ligne de commande

```powershell
npm start -- --input data/import-fournisseur.xlsx --output output/import-verified.xlsx
# Options : --limit N (limite à N premières lignes), --concurrency N (parallélisme, défaut 4)
```

## Structure

- `src/excel/reader.ts` — lecture Excel + extraction images
- `src/excel/writer.ts` — écriture Excel enrichi avec colonnes vérification
- `src/tarabel/` — nomenclature officielle TARBEL : ingestion des exports XML + validation des codes
- `src/claude/classify.ts` — appel Claude avec vision + prompt caching
- `src/index.ts` — orchestration CLI

## Nomenclature officielle TARBEL

Les codes proposés (Claude vision, historique, saisie manuelle) sont validés contre la
nomenclature officielle TARBEL chargée en base :

```powershell
npm run ingest-tarbel -- chemin\vers\exports-xml\   # fichier .xml ou dossier entier
```

Le format accepté est l'export XML TARBEL/TARIC (`TariffHistoryResponse`), aussi bien
l'**extraction initiale complète** que les **exports différentiels journaliers** (ingérés
dans l'ordre chronologique, le dernier état gagne ; les fichiers déjà traités sont sautés,
`--force` pour ré-ingérer).

⚠ Tant que seuls des différentiels journaliers sont chargés (< 10 000 codes), la validation
reste **informative**. Une fois l'extraction complète chargée, elle devient **bloquante** :
un code introuvable dans la nomenclature déclenche un retry de Claude avec la liste fermée
des codes valides de la position, force la revue manuelle, et n'est jamais écrit dans la
colonne Intrastat de l'export.

## Avertissement

Les suggestions sont **indicatives**. Toute ligne marquée "à revoir" doit être validée manuellement avant déclaration douanière.
