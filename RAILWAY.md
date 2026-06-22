# Déploiement sur Railway

Guide étape par étape pour héberger Famimport sur Railway et le rendre accessible à plusieurs personnes.

## Prérequis

- Un compte Railway (https://railway.app) — la 1ère fois tu peux te connecter avec GitHub
- Le repo `hdrckji/Famimport` (déjà sur GitHub)
- Le catalogue local construit (`catalog/catalog.db` + `catalog/photos/`)
- La CLI Railway installée localement (pour le seed des données) :
  ```powershell
  scoop install railway
  # OU
  npm i -g @railway/cli
  ```

## 1. Créer le projet Railway

1. Aller sur https://railway.app/new
2. **Deploy from GitHub repo** → choisir `hdrckji/Famimport`
3. Railway détecte Node automatiquement et lance un premier build (il échouera, c'est normal — il manque la BDD et les env vars)

## 2. Créer un volume persistant

Le volume contiendra la BDD SQLite + les photos + les uploads. Sans ça, chaque redéploiement perdrait toutes les données.

1. Dans le projet Railway → onglet **Volumes**
2. **Create Volume**
3. Nom : `famimport-data`
4. Mount path : `/data`
5. Connecter au service Famimport

## 3. Configurer les variables d'environnement

Dans le projet Railway → onglet **Variables**, ajouter :

| Variable | Valeur |
|---|---|
| `APP_PASSWORD` | Mot de passe partagé que ton équipe utilisera. Choisis quelque chose de fort, exemple : `f4m1mp0rt-2026-Famiflora!` |
| `SESSION_SECRET` | Chaîne aléatoire de 32+ caractères. Génère-la avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATA_ROOT` | `/data` |
| `NODE_ENV` | `production` |
| `ANTHROPIC_API_KEY` | Ta clé Claude (utile pour la Vague 2.5 avec fallback IA) |
| `CLAUDE_MODEL` | `claude-opus-4-7` |

Le `PORT` est défini automatiquement par Railway, ne pas le surcharger.

## 4. Redéployer avec les nouvelles variables

Railway redémarre tout seul après ajout de variables. Le service va démarrer mais **la BDD est vide** — on uploade les données à l'étape suivante.

## 5. Seeder la base de données et les photos

Depuis ton PC local, dans le dossier `C:\Users\jimmy.hendrickx\Famimport` :

```powershell
# 1. Login Railway CLI
railway login

# 2. Link au projet
railway link

# 3. Identifier le service Famimport et le volume

# 4. Upload de la BDD (~3 MB)
railway run --service famimport bash -c "mkdir -p /data && cat > /data/catalog.db" < catalog\catalog.db

# 4b. Compresser les photos puis les uploader (382 MB → ~150 MB compressé)
tar -czf catalog-photos.tar.gz -C catalog photos
# (sur Windows sans tar, utiliser 7-Zip ou WinRAR pour créer catalog-photos.tar.gz)

# 5. Uploader l'archive et l'extraire sur le volume
railway run --service famimport bash -c "cat > /tmp/photos.tar.gz" < catalog-photos.tar.gz
railway run --service famimport bash -c "cd /data && tar -xzf /tmp/photos.tar.gz && rm /tmp/photos.tar.gz"
```

> **Alternative simple** : si la CLI Railway n'aide pas pour les gros uploads, on peut héberger temporairement `catalog-photos.tar.gz` sur Dropbox/Google Drive et ajouter un script `seed:download` qui fait un `curl` au premier démarrage.

## 6. Tester

1. Dans Railway → onglet **Deployments** → URL générée (ex. `https://famimport-production.up.railway.app`)
2. Tu arrives sur la page de login
3. Mot de passe = la valeur de `APP_PASSWORD`
4. Vérifier que le dashboard charge (4552 produits visibles)
5. Vérifier que les photos s'affichent dans `/products`

## 7. Partager l'accès

Pour donner accès à un collègue :
- Lui envoyer l'URL Railway
- Lui communiquer le mot de passe (`APP_PASSWORD`) via canal sécurisé (Signal, WhatsApp, pas par mail en clair)
- Lui dire de bookmarker l'URL

## 8. Mises à jour code

À chaque `git push origin main` depuis ton PC, Railway redéploie automatiquement le code (sans toucher au volume / aux données).

## Coût attendu

Plan Hobby Railway = 5 $/mois min. Pour cet usage (petit traffic, ~400 MB stockage, BDD légère) compte **5-10 $/mois**. Voir le dashboard Railway → **Usage** pour suivre.

## Bascule retour en local

Si tu veux désactiver Railway et revenir au local seul :
- Supprimer le service Railway (la BDD reste accessible via le volume si tu veux exporter)
- En local : `npm run web` continue de fonctionner avec ton catalog local
