// offlineRead existe porque o supabase-js NÃO rejeita em erro de rede: resolve
// com { data: null, error }. Todo `try/catch` de fallback era código morto e a
// tela abria vazia offline. Estes casos travam esse comportamento.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { setNavigator, load } = require("./helpers/setup");

setNavigator({ onLine: true });
const { offlineRead, offlineReadList } = load("offline-reads");

const SERVIDOR = [{ id: "do-servidor" }];
const CACHE = [{ id: "do-cache" }];

const erroDeRede = async () => ({
  data: null,
  error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" },
  status: 0,
});
const sucesso = async () => ({ data: SERVIDOR, error: null });
const semLinha = async () => ({ data: null, error: null });
const cacheCheio = async () => CACHE;
const cacheVazio = async () => [];

beforeEach(() => setNavigator({ onLine: true }));

test("erro de rede resolvido (não lançado) cai pro cache", async () => {
  assert.deepEqual(await offlineRead(erroDeRede, cacheCheio), CACHE);
});

test("servidor respondeu: usa o servidor", async () => {
  assert.deepEqual(await offlineRead(sucesso, cacheCheio), SERVIDOR);
});

test("servidor sem a linha cai pro cache", async () => {
  // Acontece com sessão criada offline que ainda não sincronizou
  assert.deepEqual(await offlineRead(semLinha, cacheCheio), CACHE);
});

test("offline nem chama o servidor", async () => {
  setNavigator({ onLine: false });
  let tentou = false;
  await offlineRead(async () => { tentou = true; return { data: SERVIDOR }; }, cacheCheio);
  assert.equal(tentou, false);
});

test("preferLocal: com fila pendente o cache manda", async () => {
  let tentou = false;
  const r = await offlineRead(
    async () => { tentou = true; return { data: SERVIDOR }; },
    cacheCheio,
    { preferLocal: true }
  );
  assert.deepEqual(r, CACHE);
  assert.equal(tentou, false, "não deveria consultar o servidor");
});

test("preferLocal com cache vazio ainda busca no servidor", async () => {
  assert.deepEqual(await offlineRead(sucesso, cacheVazio, { preferLocal: true }), SERVIDOR);
});

// ── localOnly: a passada que pinta a tela ────────────────────────
//
// Na academia o celular está "online" pelo navigator.onLine mas com sinal
// horrível. Qualquer await de rede antes da primeira pintura vira segundos de
// spinner — a cada vez que o iOS mata o PWA, ou seja, a cada troca de app.

test("localOnly nunca toca no servidor, mesmo online", async () => {
  let tentou = false;
  const r = await offlineRead(
    async () => { tentou = true; return { data: SERVIDOR }; },
    cacheCheio,
    { localOnly: true }
  );
  assert.deepEqual(r, CACHE);
  assert.equal(tentou, false);
});

test("localOnly com cache vazio devolve vazio na hora, sem esperar rede", async () => {
  let tentou = false;
  const r = await offlineRead(
    async () => { tentou = true; return { data: SERVIDOR }; },
    cacheVazio,
    { localOnly: true }
  );
  assert.deepEqual(r, []);
  assert.equal(tentou, false, "quem decide buscar na rede é a segunda passada");
});

test("localOnly não espera timeout de query pendurada", async () => {
  const r = await offlineRead(() => new Promise(() => {}), cacheCheio, { localOnly: true });
  assert.deepEqual(r, CACHE);
});

test("makeReaders repassa o localOnly para todas as leituras da tela", async () => {
  const { makeReaders } = load("offline-reads");

  const cache = makeReaders(true);
  let tentou = false;
  await cache.read(async () => { tentou = true; return { data: SERVIDOR }; }, cacheCheio);
  assert.equal(tentou, false, "a passada de cache não consulta o servidor");

  const rede = makeReaders(false);
  assert.deepEqual(await rede.read(sucesso, cacheCheio), SERVIDOR);
  assert.deepEqual(await rede.readList(erroDeRede, async () => null), []);
});

test("cache quebrado não derruba a tela", async () => {
  const r = await offlineRead(erroDeRede, async () => { throw new Error("dexie morreu"); });
  assert.equal(r, null);
});

test("offlineReadList devolve [] em vez de null", async () => {
  assert.deepEqual(await offlineReadList(erroDeRede, async () => null), []);
});

test("lista vazia legítima do servidor é preservada", async () => {
  assert.deepEqual(await offlineReadList(async () => ({ data: [], error: null }), cacheCheio), []);
});

test("query pendurada cai pro cache no timeout", async () => {
  const r = await offlineRead(() => new Promise(() => {}), cacheCheio);
  assert.deepEqual(r, CACHE);
});
