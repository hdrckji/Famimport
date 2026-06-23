import express from "express";
import multer from "multer";
import path from "node:path";
import {
  getDashboardStats,
  listImports,
  getImport,
  listProductsForImport,
  searchProducts,
  getProduct,
  getTopTarabelCodes,
  getEanHistory,
  listTarabelCodes,
  getTarabelCode,
} from "./web/db.js";
import {
  renderDashboard,
  renderImports,
  renderImportDetail,
  renderProductsSearch,
  renderProductDetail,
} from "./web/views.js";
import {
  renderUploadList,
  renderUploadForm,
  renderUploadDetail,
} from "./web/views-upload.js";
import { renderCodesList, renderCodeDetail } from "./web/views-codes.js";
import {
  processUpload,
  getUpload,
  listUploads,
  getUploadRows,
  ensureUploadDirs,
} from "./web/upload.js";
import { buildExportWorkbook } from "./web/export-xlsx.js";
import type { Lang } from "./web/i18n.js";
import {
  requireAuth,
  renderLogin,
  setAuthCookie,
  clearAuthCookie,
} from "./web/auth.js";
import { seedDb, seedPhotos, adminStatus, flattenPhotos, fixPhotoPaths, rematchCustoms } from "./web/admin.js";
import { config } from "./config.js";

const app = express();
app.use(express.urlencoded({ extended: false }));

function getLang(req: express.Request): Lang {
  const cookieLang = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("lang="))
    ?.split("=")[1];
  if (cookieLang === "nl") return "nl";
  return "fr";
}

await ensureUploadDirs();

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}-${safe}`);
  },
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith(".xlsx")) cb(null, true);
    else cb(new Error("Seuls les fichiers .xlsx sont acceptés"));
  },
});

// Public routes
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/login", (req, res) => {
  const lang = getLang(req);
  const next = typeof req.query.next === "string" ? req.query.next : "/";
  res.send(renderLogin(lang, undefined, next));
});

app.post("/login", (req, res) => {
  const lang = getLang(req);
  const password = String(req.body?.password ?? "");
  const next = String(req.body?.next ?? "/");
  if (!config.appPassword) {
    res.status(500).send(renderLogin(lang, "APP_PASSWORD non configuré côté serveur"));
    return;
  }
  if (password === config.appPassword) {
    setAuthCookie(res);
    res.redirect(next);
    return;
  }
  res.status(401).send(renderLogin(lang, lang === "fr" ? "Mot de passe incorrect" : "Wachtwoord onjuist", next));
});

app.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.redirect("/login");
});

app.get("/lang/:lang", (req, res) => {
  const lang = req.params.lang === "nl" ? "nl" : "fr";
  const next = typeof req.query.next === "string" ? req.query.next : "/";
  res.setHeader("Set-Cookie", `lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
  res.redirect(next);
});

// Protected routes from here on
app.use(requireAuth);
app.use("/photo", express.static(config.photosDir));
app.use("/upload-photo", express.static(config.uploadPhotosDir));

app.get("/", (req, res) => {
  const lang = getLang(req);
  const stats = getDashboardStats();
  const imports = listImports();
  const topCodes = getTopTarabelCodes(15);
  res.send(renderDashboard(stats, imports, topCodes, lang));
});

app.get("/imports", (req, res) => {
  res.send(renderImports(listImports(), getLang(req)));
});

app.get("/imports/:id", (req, res) => {
  const lang = getLang(req);
  const id = Number(req.params.id);
  const imp = getImport(id);
  if (!imp) {
    res.status(404).send("Import not found");
    return;
  }
  res.send(renderImportDetail(imp, listProductsForImport(id), lang));
});

app.get("/products", (req, res) => {
  const lang = getLang(req);
  const filters = {
    q: String(req.query.q ?? ""),
    ean: String(req.query.ean ?? ""),
    hsCode: String(req.query.hsCode ?? ""),
    brand: String(req.query.brand ?? ""),
    year: String(req.query.year ?? ""),
    validatedOnly: req.query.validatedOnly ? "1" : "",
  };
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = 50;
  const offset = (page - 1) * limit;
  const results = searchProducts({
    q: filters.q || undefined,
    ean: filters.ean || undefined,
    hsCode: filters.hsCode || undefined,
    brand: filters.brand || undefined,
    year: filters.year ? Number(filters.year) : undefined,
    validatedOnly: !!filters.validatedOnly,
    limit,
    offset,
  });
  res.send(renderProductsSearch(filters, results, page, limit, lang));
});

app.get("/products/:id", (req, res) => {
  const lang = getLang(req);
  const id = Number(req.params.id);
  const p = getProduct(id);
  if (!p) {
    res.status(404).send("Product not found");
    return;
  }
  const history = p.ean ? getEanHistory(p.ean) : [p];
  res.send(renderProductDetail(p, history, lang));
});

// Tarabel codes reference
app.get("/codes", (req, res) => {
  const lang = getLang(req);
  const filters = {
    q: String(req.query.q ?? ""),
    orderBy: String(req.query.orderBy ?? ""),
  };
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = 50;
  const offset = (page - 1) * limit;
  const result = listTarabelCodes({
    q: filters.q || undefined,
    orderBy: filters.orderBy === "code" ? "code" : "uses",
    limit,
    offset,
  });
  res.send(renderCodesList(filters, result, page, limit, lang));
});

app.get("/codes/:code", (req, res) => {
  const lang = getLang(req);
  const code = req.params.code.replace(/\D/g, "");
  if (code.length === 0) {
    res.status(404).send("Code invalid");
    return;
  }
  const detail = getTarabelCode(code);
  if (!detail) {
    res.status(404).send(`Code ${code} not found in catalog`);
    return;
  }
  res.send(renderCodeDetail(detail, lang));
});

app.get("/upload", (req, res) => {
  res.send(renderUploadForm(getLang(req)));
});

app.post("/upload", upload.single("file"), async (req, res) => {
  const lang = getLang(req);
  try {
    if (!req.file) {
      res.status(400).send(renderUploadForm(lang, "Aucun fichier reçu"));
      return;
    }
    const uploadId = await processUpload(req.file.path, req.file.originalname);
    res.redirect(`/uploads/${uploadId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(renderUploadForm(lang, msg));
  }
});

app.get("/uploads", (req, res) => {
  res.send(renderUploadList(listUploads(), getLang(req)));
});

app.get("/uploads/:id", (req, res) => {
  const lang = getLang(req);
  const id = Number(req.params.id);
  const u = getUpload(id);
  if (!u) {
    res.status(404).send("Upload not found");
    return;
  }
  res.send(renderUploadDetail(u, getUploadRows(id), lang));
});

// Admin seed endpoints (temporary — for Railway initial data load).
// Auth-protected. Raw body, no multer.
app.get("/admin/status", adminStatus);
app.post("/admin/seed-db", seedDb);
app.post("/admin/seed-photos", seedPhotos);
app.post("/admin/flatten-photos", flattenPhotos);
app.post("/admin/fix-photo-paths", fixPhotoPaths);
app.post("/admin/rematch-customs", rematchCustoms);

app.get("/uploads/:id/export", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { buffer, filename } = await buildExportWorkbook(id);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

app.listen(config.port, () => {
  console.log(`Famimport explorer running on http://localhost:${config.port}`);
  if (!config.appPassword) {
    console.warn("⚠ APP_PASSWORD non défini — l'app est en accès libre (mode dev)");
  }
});
