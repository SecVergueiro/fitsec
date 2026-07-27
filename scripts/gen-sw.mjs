// Gera public/sw.js a partir de scripts/sw-template.js com a lista de precache
// do build atual. Roda no fim do `npm run build`.
//
// Precisa existir porque o app é 100% client-side: sem os chunks de /_next/static
// no Cache API, a página cacheada abre em branco offline.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(root, ".next");
const publicDir = join(root, "public");

const ASSET_EXT = /\.(js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|avif|ico)$/i;
const PUBLIC_EXT = /\.(json|png|jpe?g|svg|webp|ico|html|txt|webmanifest)$/i;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function toUrl(absolutePath, baseDir, prefix) {
  return prefix + absolutePath.slice(baseDir.length).split("\\").join("/").replace(/^\//, "");
}

// ── 1. Assets do build (hash no nome → imutáveis) ────────────────────────────
const staticDir = join(nextDir, "static");
if (!existsSync(staticDir)) {
  console.error("[gen-sw] .next/static não existe — rode `next build` antes.");
  process.exit(1);
}

const assets = walk(staticDir)
  .filter((f) => ASSET_EXT.test(f) && !f.endsWith(".map"))
  .map((f) => toUrl(f, staticDir, "/_next/static/"))
  .sort();

// ── 2. Rotas prerenderizadas (as estáticas ○ do build) ───────────────────────
let pages = [];
const prerenderManifest = join(nextDir, "prerender-manifest.json");
if (existsSync(prerenderManifest)) {
  const manifest = JSON.parse(readFileSync(prerenderManifest, "utf8"));
  pages = Object.keys(manifest.routes ?? {}).filter((r) => !r.includes("["));
}
if (!pages.includes("/")) pages.unshift("/");
// /login precisa estar aqui: o AuthProvider redireciona pra lá e sem cache
// a tela morria em "Offline" quando o token expirava sem conexão.
if (!pages.includes("/login")) pages.push("/login");
pages.sort();

// ── 3. Arquivos de public/ (manifest, ícones, offline.html) ──────────────────
const publicFiles = walk(publicDir)
  .filter((f) => PUBLIC_EXT.test(f))
  .map((f) => toUrl(f, publicDir, "/"))
  .filter((u) => u !== "/sw.js")
  .sort();

// ── 4. Escreve o sw.js ───────────────────────────────────────────────────────
const buildId = readFileSync(join(nextDir, "BUILD_ID"), "utf8").trim();
const template = readFileSync(join(root, "scripts", "sw-template.js"), "utf8");

const output = template
  .replace("__BUILD_ID__", buildId)
  .replace("__PRECACHE_ASSETS__", JSON.stringify(assets, null, 2))
  .replace("__PRECACHE_PAGES__", JSON.stringify([...pages, ...publicFiles], null, 2));

writeFileSync(join(publicDir, "sw.js"), output, "utf8");

const bytes = assets.reduce((sum, url) => {
  const f = join(staticDir, url.replace("/_next/static/", ""));
  return sum + (existsSync(f) ? statSync(f).size : 0);
}, 0);

console.log(
  `[gen-sw] public/sw.js gerado — build ${buildId} · ${assets.length} assets ` +
    `(${(bytes / 1024 / 1024).toFixed(1)} MB) · ${pages.length} páginas · ${publicFiles.length} arquivos de public/`
);
