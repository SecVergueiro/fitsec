// O service worker precisa pré-cachear tudo que as páginas usam.
//
// O app é 100% "use client": se um chunk de /_next/static ficar de fora, a
// página em cache abre em branco offline. E se uma rota voltar a ser dinâmica
// (ƒ no build), não existe HTML pra servir sem rede.
//
// Lê o build em .next — exige `npm run build` antes.

const { test, skip } = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const NEXT = path.join(raiz, ".next");
const SW = path.join(raiz, "public", "sw.js");

if (!existsSync(NEXT) || !existsSync(path.join(NEXT, "prerender-manifest.json"))) {
  skip("sem build em .next — rode `npm run build` antes");
  return;
}

const sw = readFileSync(SW, "utf8");
const assets = new Set(JSON.parse(sw.match(/const PRECACHE_ASSETS = (\[[\s\S]*?\]);/)[1]));
const pages = JSON.parse(sw.match(/const PRECACHE_PAGES = (\[[\s\S]*?\]);/)[1]);
const rotas = JSON.parse(readFileSync(path.join(NEXT, "app-path-routes-manifest.json"), "utf8"));
const prerender = JSON.parse(readFileSync(path.join(NEXT, "prerender-manifest.json"), "utf8"));

/** Rotas que o usuário precisa alcançar offline. */
const CRITICAS = [
  "/",
  "/login",
  "/sessao",
  "/sessao/ativa",
  "/sessao/resumo",
  "/stats/exercicio",
  "/treinos/template",
  "/treinos/dia",
];

test("o sw.js foi gerado pelo build atual", () => {
  const buildId = readFileSync(path.join(NEXT, "BUILD_ID"), "utf8").trim();
  assert.match(sw, new RegExp(`const VERSION = "${buildId}"`), "public/sw.js está velho — rode npm run build");
});

test("as rotas críticas são estáticas e estão no precache", () => {
  const estaticas = new Set(Object.keys(prerender.routes ?? {}));
  for (const rota of CRITICAS) {
    assert.ok(estaticas.has(rota), `${rota} deixou de ser prerenderizada`);
    assert.ok(pages.includes(rota), `${rota} fora do precache do service worker`);
  }
});

test("todo asset referenciado pelo HTML das páginas está no precache", () => {
  const faltando = [];
  for (const rota of pages.filter((p) => !p.includes("."))) {
    const arquivo = path.join(NEXT, "server", "app", rota === "/" ? "index.html" : `${rota}.html`);
    if (!existsSync(arquivo)) continue;
    const html = readFileSync(arquivo, "utf8");
    for (const ref of new Set(html.match(/\/_next\/static\/[A-Za-z0-9._/-]+/g) ?? [])) {
      if (!assets.has(ref)) faltando.push(`${rota} → ${ref}`);
    }
  }
  assert.deepEqual(faltando, [], "chunk fora do precache faz a página abrir em branco offline");
});

test("offline.html está no precache", () => {
  assert.ok(pages.includes("/offline.html"));
});

test("as únicas rotas dinâmicas são o link público e os redirecionadores", () => {
  const dinamicas = Object.values(rotas).filter((r) => r.includes("["));
  const permitidas = [
    "/public/sessao/[id]", // link de compartilhamento: precisa de URL real e de rede
    "/sessao/[id]",
    "/sessao/[id]/resumo",
    "/stats/[exerciseId]",
    "/treinos/template/[id]",
    "/treinos/template/[id]/dia/[dayId]",
  ];
  const inesperadas = dinamicas.filter((r) => !permitidas.includes(r));
  assert.deepEqual(inesperadas, [], "rota dinâmica nova não funciona offline — use ?id= numa rota estática");
});

test("nenhuma página estática embute um id na URL", () => {
  // É o que permite um único HTML em cache servir qualquer sessão
  for (const rota of ["/sessao/ativa", "/sessao/resumo", "/treinos/dia"]) {
    const html = readFileSync(path.join(NEXT, "server", "app", `${rota}.html`), "utf8");
    assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, `${rota} embute um uuid`);
  }
});
