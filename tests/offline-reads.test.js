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
