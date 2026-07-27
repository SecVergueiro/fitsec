/* eslint-disable */
// Template do service worker. Os placeholders __*__ são substituídos por
// scripts/gen-sw.mjs no fim do `npm run build`, que gera o public/sw.js real.
//
// NÃO edite public/sw.js — edite este arquivo.

const VERSION = "__BUILD_ID__";
const CACHE = "fitsec-" + VERSION;

// Chunks JS/CSS do build (nomes com hash → imutáveis).
// Sem isso o app abria em branco offline: todas as páginas são "use client",
// e o SW antigo ignorava /_next/, então o JS nunca era cacheado.
const PRECACHE_ASSETS = __PRECACHE_ASSETS__;

// HTML das rotas estáticas + arquivos de public/ (manifest, ícones, offline.html)
const PRECACHE_PAGES = __PRECACHE_PAGES__;

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
