import crypto from "node:crypto";
import type express from "express";
import { config } from "../config.js";
import { layout, escapeHtml } from "./layout.js";
import type { Lang } from "./i18n.js";

const COOKIE_NAME = "famimport_session";
const COOKIE_MAX_AGE_DAYS = 30;

function sign(value: string): string {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("base64url");
}

function makeToken(): string {
  const expiry = Date.now() + COOKIE_MAX_AGE_DAYS * 86400 * 1000;
  const payload = `auth.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [marker, expiryStr, sig] = parts;
  if (marker !== "auth") return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = sign(`${marker}.${expiryStr}`);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function readCookie(req: express.Request, name: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.split("=")[1];
}

export function isAuthenticated(req: express.Request): boolean {
  if (!config.appPassword) return true; // no password configured = open access (dev)
  return verifyToken(readCookie(req, COOKIE_NAME));
}

const PUBLIC_PATHS = new Set(["/login", "/health"]);

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (
    PUBLIC_PATHS.has(req.path) ||
    req.path.startsWith("/static/") ||
    req.path.startsWith("/lang/")
  ) {
    next();
    return;
  }
  if (isAuthenticated(req)) {
    next();
    return;
  }
  const nextUrl = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?next=${nextUrl}`);
}

export function renderLogin(lang: Lang, error?: string, next: string = "/"): string {
  const isFr = lang === "fr";
  const body = `
    <div class="min-h-[60vh] flex items-center justify-center">
      <div class="bg-white rounded-lg border border-slate-200 p-8 w-full max-w-sm">
        <h1 class="text-xl font-bold mb-4">${isFr ? "Connexion" : "Inloggen"}</h1>
        ${error ? `<div class="bg-red-50 border border-red-200 text-red-800 rounded p-2 mb-3 text-sm">${escapeHtml(error)}</div>` : ""}
        <form method="POST" action="/login" class="space-y-3">
          <input type="hidden" name="next" value="${escapeHtml(next)}">
          <input type="password" name="password" required autofocus
            placeholder="${isFr ? "Mot de passe" : "Wachtwoord"}"
            class="w-full border border-slate-300 rounded px-3 py-2 text-sm">
          <button type="submit"
            class="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700">
            ${isFr ? "Se connecter" : "Inloggen"}
          </button>
        </form>
      </div>
    </div>
  `;
  return layout(isFr ? "Connexion" : "Inloggen", body, "", lang, "/login");
}

export function setAuthCookie(res: express.Response): void {
  const token = makeToken();
  const maxAge = COOKIE_MAX_AGE_DAYS * 86400;
  const secure = config.isProduction ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
  );
}

export function clearAuthCookie(res: express.Response): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
}
