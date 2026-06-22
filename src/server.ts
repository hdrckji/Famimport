import express from "express";
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
} from "./web/db.js";
import {
  renderDashboard,
  renderImports,
  renderImportDetail,
  renderProductsSearch,
  renderProductDetail,
} from "./web/views.js";
import type { Lang } from "./web/i18n.js";

const app = express();
const PHOTOS_ROOT = path.join(process.cwd(), "catalog", "photos");

function getLang(req: express.Request): Lang {
  const cookieLang = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("lang="))
    ?.split("=")[1];
  if (cookieLang === "nl") return "nl";
  return "fr";
}

app.use("/photo", express.static(PHOTOS_ROOT));

app.get("/lang/:lang", (req, res) => {
  const lang = req.params.lang === "nl" ? "nl" : "fr";
  const next = typeof req.query.next === "string" ? req.query.next : "/";
  res.setHeader("Set-Cookie", `lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
  res.redirect(next);
});

app.get("/", (req, res) => {
  const lang = getLang(req);
  const stats = getDashboardStats();
  const imports = listImports();
  const topCodes = getTopTarabelCodes(15);
  res.send(renderDashboard(stats, imports, topCodes, lang));
});

app.get("/imports", (req, res) => {
  const lang = getLang(req);
  const imports = listImports();
  res.send(renderImports(imports, lang));
});

app.get("/imports/:id", (req, res) => {
  const lang = getLang(req);
  const id = Number(req.params.id);
  const imp = getImport(id);
  if (!imp) {
    res.status(404).send("Import not found");
    return;
  }
  const products = listProductsForImport(id);
  res.send(renderImportDetail(imp, products, lang));
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

const PORT = Number(process.env.PORT ?? 3050);
app.listen(PORT, () => {
  console.log(`Famimport explorer running on http://localhost:${PORT}`);
});
