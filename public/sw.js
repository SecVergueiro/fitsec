/* eslint-disable */
// Template do service worker. Os placeholders __*__ são substituídos por
// scripts/gen-sw.mjs no fim do `npm run build`, que gera o public/sw.js real.
//
// NÃO edite public/sw.js — edite este arquivo.

const VERSION = "hKQhg2fCbf1ScSMg8J78c";
const CACHE = "fitsec-" + VERSION;

// Chunks JS/CSS do build (nomes com hash → imutáveis).
// Sem isso o app abria em branco offline: todas as páginas são "use client",
// e o SW antigo ignorava /_next/, então o JS nunca era cacheado.
const PRECACHE_ASSETS = [
  "/_next/static/chunks/101-9698c410db234899.js",
  "/_next/static/chunks/117-7bf0dad226a9fc21.js",
  "/_next/static/chunks/378-16023ed12b5e3ab5.js",
  "/_next/static/chunks/394-748dad96370d08bb.js",
  "/_next/static/chunks/44530001-9b9daae6bcc8e13c.js",
  "/_next/static/chunks/492-973e37c70f01e2a3.js",
  "/_next/static/chunks/533-bef2450918730dd5.js",
  "/_next/static/chunks/601-d63898c72d21787c.js",
  "/_next/static/chunks/648-33438c3959560a82.js",
  "/_next/static/chunks/652-5fc96f0720a99150.js",
  "/_next/static/chunks/659-08cbc3cc1b7bbfa4.js",
  "/_next/static/chunks/689-10a6472c0a01a5ff.js",
  "/_next/static/chunks/966-ec1d7f512174d718.js",
  "/_next/static/chunks/app/_not-found/page-0c9aa90fe6aaf72b.js",
  "/_next/static/chunks/app/biblioteca/page-7c721bd626aa8eee.js",
  "/_next/static/chunks/app/historico/page-82a87d2cab395d79.js",
  "/_next/static/chunks/app/layout-480e25e87b004943.js",
  "/_next/static/chunks/app/login/page-ce15919e9da941c8.js",
  "/_next/static/chunks/app/page-144fe677f77485be.js",
  "/_next/static/chunks/app/perfil/page-2077ef276e8bdc5e.js",
  "/_next/static/chunks/app/public/sessao/[id]/page-e67ce0a53feb40b6.js",
  "/_next/static/chunks/app/sessao/[id]/page-c642186aaba38c1b.js",
  "/_next/static/chunks/app/sessao/[id]/resumo/page-562c434320b15a3d.js",
  "/_next/static/chunks/app/sessao/ativa/page-637dc5bcf2f76fdf.js",
  "/_next/static/chunks/app/sessao/page-3605439eee4fde7c.js",
  "/_next/static/chunks/app/sessao/rapido/page-692fd2aaab4b7611.js",
  "/_next/static/chunks/app/sessao/resumo/page-1029a032ac070347.js",
  "/_next/static/chunks/app/stats/[exerciseId]/page-d9123514d92eff06.js",
  "/_next/static/chunks/app/stats/exercicio/page-d4e9c4b7afd3dbab.js",
  "/_next/static/chunks/app/stats/page-e375c718fe981ce6.js",
  "/_next/static/chunks/app/treinos/dia/page-aed06883ed71b4e7.js",
  "/_next/static/chunks/app/treinos/mesociclo/novo/page-27be27c400bfd5f4.js",
  "/_next/static/chunks/app/treinos/mesociclo/page-60ad8b4e12983fc3.js",
  "/_next/static/chunks/app/treinos/novo/page-13cd0a5ad21f2ec2.js",
  "/_next/static/chunks/app/treinos/page-21677b6b93ba443a.js",
  "/_next/static/chunks/app/treinos/template/[id]/dia/[dayId]/page-77d8c1e580961f6f.js",
  "/_next/static/chunks/app/treinos/template/[id]/page-fab421b684cb777c.js",
  "/_next/static/chunks/app/treinos/template/page-757d513975b33c14.js",
  "/_next/static/chunks/fd9d1056-090e7b7a3a7d88a0.js",
  "/_next/static/chunks/framework-00a8ba1a63cfdc9e.js",
  "/_next/static/chunks/main-97be3bf400660a4e.js",
  "/_next/static/chunks/main-app-e39e4f96995db67e.js",
  "/_next/static/chunks/pages/_app-6f5312077c4a5604.js",
  "/_next/static/chunks/pages/_error-2f37a8b74d52c0a0.js",
  "/_next/static/chunks/polyfills-42372ed130431b0a.js",
  "/_next/static/chunks/webpack-36a1d514310b5a92.js",
  "/_next/static/css/6b51c7ec7fe6a230.css",
  "/_next/static/hKQhg2fCbf1ScSMg8J78c/_buildManifest.js",
  "/_next/static/hKQhg2fCbf1ScSMg8J78c/_ssgManifest.js"
];

// HTML das rotas estáticas + arquivos de public/ (manifest, ícones, offline.html)
const PRECACHE_PAGES = [
  "/",
  "/biblioteca",
  "/historico",
  "/login",
  "/perfil",
  "/sessao",
  "/sessao/ativa",
  "/sessao/rapido",
  "/sessao/resumo",
  "/stats",
  "/stats/exercicio",
  "/treinos",
  "/treinos/dia",
  "/treinos/mesociclo",
  "/treinos/mesociclo/novo",
  "/treinos/novo",
  "/treinos/template",
  "/apple-touch-icon.png",
  "/favicon-16.png",
  "/favicon-32.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/manifest.json",
  "/offline.html"
];

const OFFLINE_URL = "/offline.html";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// ─────────────────────────────────────────────────────────────
// INSTALL — pré-cacheia shell + assets
// ─────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `cache.addAll` é atômico: uma única URL falhando derrubava a instalação
      // inteira e o app ficava sem offline nenhum. Aqui cada item falha sozinho.
      await Promise.all(
        PRECACHE_ASSETS.concat(PRECACHE_PAGES).map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

// ─────────────────────────────────────────────────────────────
// ACTIVATE — limpa caches de builds anteriores
// ─────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ─────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Supabase e /api: sempre rede, nunca cache (dados vivos + auth).
  if (url.hostname.includes("supabase") || url.pathname.startsWith("/api/")) return;

  // Fontes do Google: cache-first (imutáveis). Mantém a tipografia offline.
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Qualquer outro domínio: não intercepta.
  if (url.origin !== self.location.origin) return;

  // Payload RSC do App Router (?_rsc= ou header RSC): sempre rede, nunca cache.
  // Se falhar offline, o Next cai pra navegação dura — tratada mais abaixo.
  if (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") return;

  // Assets do build: hash no nome → cache-first, sem revalidar.
  if (url.pathname.indexOf("/_next/static/") === 0) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Resto do /_next (otimizador de imagem, etc.)
  if (url.pathname.indexOf("/_next/") === 0) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }

  // manifest.json, ícones, offline.html…
  event.respondWith(networkFirst(req));
});

// ─────────────────────────────────────────────────────────────
// Estratégias
// ─────────────────────────────────────────────────────────────

/** Guarda no cache ignorando respostas que não dá pra armazenar (redirect, erro). */
function putSafe(cache, request, response) {
  if (!response) return;
  const cacheable = response.ok || response.type === "opaque";
  if (!cacheable || response.status === 206) return;
  try {
    cache.put(request, response.clone()).catch(() => {});
  } catch {
    /* resposta não clonável */
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    putSafe(cache, request, res);
    return res;
  } catch {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    putSafe(cache, request, res);
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    putSafe(cache, request, res);
    return res;
  } catch {
    // 1. A própria URL (inclui rotas dinâmicas já visitadas online)
    const opts = { ignoreVary: true, ignoreSearch: true };
    const exact = await cache.match(request, opts);
    if (exact) return exact;

    // 2. O mesmo caminho sem query string
    const byPath = await cache.match(new URL(request.url).pathname, opts);
    if (byPath) return byPath;

    // 3. Página de fallback
    const offline = await cache.match(OFFLINE_URL, { ignoreVary: true });
    if (offline) return offline;

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
