// Política de erro das escritas.
//
// Falha transitória (rede, timeout, 401, 5xx) vai pra fila. Recusa definitiva
// do servidor (constraint, coluna inválida) estoura pra UI: enfileirar isso
// fazia o registro sumir em silêncio depois de MAX_RETRIES tentativas.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { setNavigator, stubSupabase, load } = require("./helpers/setup");

setNavigator({ onLine: true });
const servidor = stubSupabase();

// Dexie e a fila entram por conta própria nos outros testes; aqui isolamos a
// política de erro, então o espelho local e a fila são fakes simples.
const enfileirados = [];
const localTable = new Map();
require.cache[require.resolve("../.test-build/offline-db.js")] = {
  id: "offline-db", filename: require.resolve("../.test-build/offline-db.js"), loaded: true,
  exports: {
    db: {
      exercises: {
        put: async (r) => localTable.set(r.id, r),
        delete: async (id) => localTable.delete(id),
        get: async (id) => localTable.get(id),
      },
    },
  },
};
require.cache[require.resolve("../.test-build/sync-engine.js")] = {
  id: "sync-engine", filename: require.resolve("../.test-build/sync-engine.js"), loaded: true,
  exports: {
    enqueue: async (table, op, payload, match) => { enfileirados.push({ table, op, payload, match }); },
    flushQueue: async () => ({ flushed: 0, failed: 0 }),
  },
};

const { offlineInsert, offlineUpdate, offlineDelete, ServerRejectedError } = load("offline-writes");

const REDE = { message: "TypeError: Failed to fetch", status: 0 };
const TIMEOUT = { message: "AbortError: The operation was aborted", status: 0 };
const TOKEN_VENCIDO = { message: "JWT expired", status: 401, code: "PGRST301" };
const SERVIDOR_FORA = { message: "Bad gateway", status: 502 };
const CONSTRAINT = { message: "duplicate key value violates unique constraint", status: 409, code: "23505" };
const COLUNA_INVALIDA = { message: "column x does not exist", status: 400, code: "42703" };

beforeEach(() => {
  servidor.reset();
  enfileirados.length = 0;
  localTable.clear();
  setNavigator({ onLine: true });
});

async function inserir(erro) {
  servidor.estado.erroForcado = erro;
  return offlineInsert("exercises", { name: "Supino" }, { localTable: "exercises" });
}

for (const [nome, erro] of [
  ["falha de rede", REDE],
  ["timeout/abort", TIMEOUT],
  ["401 token vencido", TOKEN_VENCIDO],
  ["502 servidor fora", SERVIDOR_FORA],
]) {
  test(`insert · ${nome} → fila, sem erro na UI`, async () => {
    const r = await inserir(erro);
    assert.ok(r.id, "devolve o registro com id local");
    assert.equal(enfileirados.length, 1);
    assert.equal(localTable.size, 1, "mantém no cache local");
  });
}

for (const [nome, erro] of [
  ["409 constraint duplicada", CONSTRAINT],
  ["400 coluna inválida", COLUNA_INVALIDA],
]) {
  test(`insert · ${nome} → erro na UI, sem fila`, async () => {
    await assert.rejects(() => inserir(erro), ServerRejectedError);
    assert.equal(enfileirados.length, 0);
    assert.equal(localTable.size, 0, "desfaz o registro local");
  });
}

test("insert · sucesso não enfileira", async () => {
  const r = await inserir(null);
  assert.equal(enfileirados.length, 0);
  assert.equal(servidor.estado.recebidos.length, 1);
  assert.ok(r.id);
});

test("insert · offline enfileira com id local", async () => {
  setNavigator({ onLine: false });
  const r = await offlineInsert("exercises", { name: "Agachamento" }, { localTable: "exercises" });
  assert.equal(enfileirados.length, 1);
  assert.ok(r.id);
  assert.equal(servidor.estado.recebidos.length, 0);
});

// ── modo otimista (caminho de salvar série) ──────────────────────
//
// O que não pode acontecer: o botão esperar o servidor. Era isso que atrasava
// o início do descanso e fazia o timer nativo do iPhone ganhar.

test("otimista · não espera o servidor e mesmo assim não perde a série", async () => {
  const r = await offlineInsert(
    "session_sets",
    { weight_kg: 80, reps: 8 },
    { localTable: "exercises", optimistic: true }
  );

  assert.ok(r.id, "devolve na hora, com id local");
  assert.equal(localTable.size, 1, "já está no cache local — a UI pinta imediato");
  assert.equal(servidor.estado.recebidos.length, 0, "não tocou na rede no caminho crítico");
  assert.equal(enfileirados.length, 1, "e está na fila, então sobrevive ao iOS matar o app");
  assert.equal(enfileirados[0].payload.weight_kg, 80);
});

test("otimista · offline se comporta igual", async () => {
  setNavigator({ onLine: false });
  const r = await offlineInsert(
    "session_sets",
    { weight_kg: 100, reps: 5 },
    { localTable: "exercises", optimistic: true }
  );
  assert.ok(r.id);
  assert.equal(enfileirados.length, 1);
});

test("otimista · erro do servidor não estoura no caminho crítico", async () => {
  // A recusa é problema do flush, não do dedo do usuário no botão: salvar a
  // série nunca pode lançar no meio do treino.
  servidor.estado.erroForcado = CONSTRAINT;
  const r = await offlineInsert(
    "session_sets",
    { weight_kg: 60, reps: 12 },
    { localTable: "exercises", optimistic: true }
  );
  assert.ok(r.id);
  assert.equal(enfileirados.length, 1);
});

// ── 4G ruim: online pelo navigator, mas o fetch fica pendurado ───
//
// É o cenário real da academia — e o que fazia "adicionar exercício" e
// "finalizar exercício" parecerem quebrados sem internet. `navigator.onLine`
// é true, então o código tentava a rede; sem teto de tempo o await segurava a
// tela até o timeout do sistema (dezenas de segundos no iOS).

test("insert · query pendurada desiste no teto de tempo e vai pra fila", async () => {
  servidor.estado.travando = true;
  const t = Date.now();

  const r = await offlineInsert("exercises", { name: "Remada" }, { localTable: "exercises" });

  assert.ok(r.id, "devolve o registro em vez de travar a tela");
  assert.equal(enfileirados.length, 1, "a mutação não pode se perder no caminho");
  assert.equal(localTable.size, 1, "e continua no cache local");
  assert.ok(Date.now() - t < 15_000, "não esperou o timeout do sistema");
});

test("update · query pendurada desiste no teto de tempo e vai pra fila", async () => {
  servidor.estado.travando = true;
  await offlineUpdate("session_exercises", { is_completed: true }, { id: "ex-1" });
  assert.equal(enfileirados.length, 1);
});

test("delete · query pendurada desiste no teto de tempo e vai pra fila", async () => {
  servidor.estado.travando = true;
  await offlineDelete("session_sets", { id: "s-1" });
  assert.equal(enfileirados.length, 1);
});

// ── update otimista (finalizar exercício) ────────────────────────

test("update otimista não toca na rede e volta na hora", async () => {
  servidor.estado.travando = true;
  await offlineUpdate(
    "session_exercises",
    { is_completed: true },
    { id: "ex-1" },
    { optimistic: true }
  );
  assert.equal(enfileirados.length, 1);
  assert.equal(enfileirados[0].op, "update");
  assert.deepEqual(enfileirados[0].match, { id: "ex-1" });
});

test("update segue a mesma política", async () => {
  servidor.estado.erroForcado = REDE;
  await offlineUpdate("exercises", { name: "x" }, { id: "1" });
  assert.equal(enfileirados.length, 1);

  enfileirados.length = 0;
  servidor.estado.erroForcado = CONSTRAINT;
  await assert.rejects(() => offlineUpdate("exercises", { name: "x" }, { id: "1" }), ServerRejectedError);
  assert.equal(enfileirados.length, 0);
});

test("delete segue a mesma política", async () => {
  servidor.estado.erroForcado = REDE;
  await offlineDelete("exercises", { id: "1" });
  assert.equal(enfileirados.length, 1);

  enfileirados.length = 0;
  servidor.estado.erroForcado = COLUNA_INVALIDA;
  await assert.rejects(() => offlineDelete("exercises", { id: "1" }), ServerRejectedError);
  assert.equal(enfileirados.length, 0);
});
