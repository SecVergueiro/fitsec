// Executa o public/sw.js real num sandbox com Cache API e fetch falsos, para
// checar o que ele serve quando a rede cai. É o teste que cobre o bug original:
// o service worker ignorava /_next/, então o JS nunca era cacheado e a página
// em cache abria em branco.

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SW = path.join(__dirname, "..", "public", "sw.js");
const ORIGIN = "https://fitsec.app";
const UUID = "11111111-2222-3333-4444-555555555555";

let online = true;
let handlers = {};
let caches;
let cacheName;

class FakeCache {
  constructor() { this.map = new Map(); }
  async add(request) {
    const res = await sandboxFetch(request);
    if (!res.ok) throw new Error("add falhou");
    this.map.set(new URL(request.url ?? request, ORIGIN).toString(), res);
  }
  async put(request, response) {
    this.map.set(new URL(request.url ?? request, ORIGIN).toString(), response);
  }
  async match(request, opts = {}) {
    const url = new URL(request.url ?? request, ORIGIN);
    const exato = this.map.get(url.toString());
    if (exato) return exato;
    if (opts.ignoreSearch) {
      const semQuery = url.origin + url.pathname;
      for (const [k, v] of this.map) {
        const ku = new URL(k);
        if (ku.origin + ku.pathname === semQuery) return v;
      }
    }
    return undefined;
  }
}

function corpo(url) {
  if (url.includes("/_next/static/")) return `/*chunk ${url}*/`;
  if (url.endsWith("offline.html")) return "<html>PAGINA OFFLINE</html>";
  return `<html>HTML de ${new URL(url).pathname}</html>`;
}

async function sandboxFetch(input) {
  const url = typeof input === "string" ? input : input.url;
  if (!online) throw new TypeError("Failed to fetch");
  return new Response(corpo(url), { status: 200, headers: { "Content-Type": "text/html" } });
}

class SWRequest {
  constructor(input, init = {}) {
    this.url = new URL(typeof input === "string" ? input : input.url, ORIGIN).toString();
    this.method = init.method ?? "GET";
    this.mode = init.mode ?? "cors";
    this.headers = new Headers(init.headers ?? {});
  }
}

async function fire(tipo, evento) {
  const esperas = [];
  const ev = { ...evento, waitUntil: (p) => esperas.push(p), respondWith: (p) => { ev._res = p; } };
  for (const fn of handlers[tipo] ?? []) await fn(ev);
  await Promise.all(esperas);
  return ev._res ? await ev._res : null;
}

const navegar = (url) => ({ url, method: "GET", mode: "navigate", headers: new Headers() });
const buscar = (url, headers = {}) => ({ url, method: "GET", mode: "cors", headers: new Headers(headers) });

before(async () => {
  assert.ok(existsSync(SW), "public/sw.js não existe — rode npm run build");

  handlers = {};
  caches = {
    store: new Map(),
    async open(nome) {
      if (!this.store.has(nome)) this.store.set(nome, new FakeCache());
      return this.store.get(nome);
    },
    async keys() { return [...this.store.keys()]; },
    async delete(nome) { return this.store.delete(nome); },
    async match(req, opts) {
      for (const c of this.store.values()) {
        const hit = await c.match(req, opts);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const self = {
    addEventListener: (tipo, fn) => { (handlers[tipo] ??= []).push(fn); },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    location: { origin: ORIGIN },
  };

  vm.createContext(Object.assign(globalThis, { self, caches, fetch: sandboxFetch, Request: SWRequest }));
  vm.runInThisContext(readFileSync(SW, "utf8"), { filename: "sw.js" });

  online = true;
  await fire("install", {});
  await fire("activate", {});
  cacheName = (await caches.keys())[0];
});

test("install pré-cacheia o shell inteiro", () => {
  const n = caches.store.get(cacheName).map.size;
  assert.ok(n > 40, `só ${n} entradas em cache`);
});

test("offline: as rotas com ?id= servem o HTML pré-cacheado", async () => {
  online = false;
  for (const [rota, query] of [
    ["/sessao/ativa", `?id=${UUID}`],
    ["/sessao/resumo", `?id=${UUID}`],
    ["/stats/exercicio", `?id=${UUID}`],
    ["/treinos/template", `?id=${UUID}`],
    ["/treinos/dia", `?id=${UUID}&template=${UUID}`],
  ]) {
    const res = await fire("fetch", { request: navegar(ORIGIN + rota + query) });
    assert.ok(res, `${rota} não respondeu`);
    assert.match(await res.text(), new RegExp(rota), `${rota} serviu outra coisa`);
  }
});

test("offline: /login abre do cache", async () => {
  online = false;
  const res = await fire("fetch", { request: navegar(`${ORIGIN}/login?from=%2Fsessao`) });
  assert.match(await res.text(), /\/login/);
});

test("offline: os chunks JS vêm do cache", async () => {
  online = false;
  const chunk = [...caches.store.get(cacheName).map.keys()].find((u) => u.includes("/_next/static/chunks/"));
  const res = await fire("fetch", { request: buscar(chunk) });
  assert.equal(res.status, 200);
});

test("offline: URL desconhecida cai no offline.html", async () => {
  online = false;
  const res = await fire("fetch", { request: navegar(`${ORIGIN}/rota/que/nao/existe`) });
  assert.match(await res.text(), /PAGINA OFFLINE/);
});

test("nunca intercepta Supabase, payload RSC nem POST", async () => {
  online = false;
  assert.equal(await fire("fetch", { request: buscar("https://abc.supabase.co/rest/v1/session_sets") }), null);
  assert.equal(await fire("fetch", { request: buscar(`${ORIGIN}/sessao/ativa?id=${UUID}&_rsc=abc`) }), null);
  assert.equal(
    await fire("fetch", { request: { url: `${ORIGIN}/sessao/ativa`, method: "POST", mode: "cors", headers: new Headers() } }),
    null
  );
});

test("com rede de volta, busca no servidor de novo", async () => {
  online = true;
  const res = await fire("fetch", { request: navegar(`${ORIGIN}/sessao/ativa?id=${UUID}`) });
  assert.ok(res);
});
