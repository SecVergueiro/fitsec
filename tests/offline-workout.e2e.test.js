// Treino inteiro sem internet, com IndexedDB de verdade (fake-indexeddb) e os
// módulos reais: offline-db, offline-writes e sync-engine. Só o servidor é
// falso.
//
// Responde a pergunta que importa: registrar treino offline e reconectar perde
// alguma série?

require("fake-indexeddb/auto");

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { setNavigator, fakeWindow, stubSupabase, load } = require("./helpers/setup");

fakeWindow(); // lib/offline-db só instancia o Dexie quando `window` existe
setNavigator({ onLine: true });
const servidor = stubSupabase();

const { db } = load("offline-db");
const { offlineInsert, offlineUpdate } = load("offline-writes");
const { flushQueue, pendingCount } = load("sync-engine");

const PESOS = [
  { weight_kg: 80, reps: 8 },
  { weight_kg: 82.5, reps: 7 },
  { weight_kg: 85, reps: 5 },
];

let sessao;
let exercicio;

before(async () => {
  assert.ok(db, "Dexie não abriu");
  servidor.reset();

  // ── Sem internet: o treino inteiro ────────────────────────────────────
  setNavigator({ onLine: false });
  servidor.estado.online = false;

  sessao = await offlineInsert(
    "workout_sessions",
    {
      template_day_id: "dia-upper",
      session_date: "2026-07-27",
      started_at: "2026-07-27T10:00:00.000Z",
      user_id: "user-1",
    },
    { localTable: "workout_sessions" }
  );

  exercicio = await offlineInsert(
    "session_exercises",
    { session_id: sessao.id, exercise_id: "ex-supino", exercise_order: 1, is_completed: false },
    { localTable: "session_exercises" }
  );

  for (const [i, s] of PESOS.entries()) {
    await offlineInsert(
      "session_sets",
      {
        session_id: sessao.id,
        session_exercise_id: exercicio.id,
        exercise_id: "ex-supino",
        set_number: i + 1,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rir: 2,
        is_warmup: false,
        performed_at: new Date(Date.UTC(2026, 6, 27, 10, 10 + i)).toISOString(),
      },
      { localTable: "session_sets" }
    );
  }

  await offlineUpdate(
    "workout_sessions",
    { completed_at: "2026-07-27T11:00:00.000Z", duration_minutes: 60 },
    { id: sessao.id },
    { localTable: "workout_sessions", localId: sessao.id }
  );
});

test("nada foi ao servidor enquanto offline", () => {
  assert.deepEqual(servidor.estado.recebidos, []);
});

test("as séries ficam legíveis no cache local", async () => {
  // É o que a tela lê ao reabrir ainda sem internet
  const sets = await db.session_sets.where("session_exercise_id").equals(exercicio.id).sortBy("set_number");
  assert.equal(sets.length, 3);
  assert.deepEqual(sets.map((s) => s.weight_kg), [80, 82.5, 85]);
});

test("a sessão fica marcada como finalizada e com user_id", async () => {
  const local = await db.workout_sessions.get(sessao.id);
  assert.ok(local.completed_at);
  // user_id ausente era o que a RLS rejeitava no flush, perdendo o treino
  assert.equal(local.user_id, "user-1");
});

test("a fila tem as 6 mutações", async () => {
  assert.equal(await pendingCount(), 6);
});

test("token vencido ao reconectar não queima tentativas", async () => {
  setNavigator({ onLine: true });
  servidor.estado.online = true;
  servidor.estado.sessaoValida = false;

  await flushQueue();

  assert.equal(await pendingCount(), 6, "a fila deveria estar intacta");
  assert.deepEqual(servidor.estado.recebidos, [], "nada deveria ter sido enviado");
  const tentativas = (await db.pending_mutations.toArray()).reduce((m, x) => Math.max(m, x.attempts), 0);
  assert.equal(tentativas, 0);
});

test("com o token renovado, sincroniza tudo sem perder nada", async () => {
  servidor.estado.sessaoValida = true;
  const r = await flushQueue();

  assert.equal(r.flushed, 6);
  assert.equal(await pendingCount(), 0);

  const enviados = servidor.estado.recebidos;
  assert.equal(enviados.length, 6);

  // A sessão precisa existir antes das séries (chave estrangeira)
  assert.ok(
    enviados.findIndex((x) => x.table === "workout_sessions") <
      enviados.findIndex((x) => x.table === "session_sets"),
    "ordem da fila quebraria a FK"
  );

  const sets = enviados.filter((x) => x.table === "session_sets");
  assert.equal(sets.length, 3);
  assert.ok(sets.every((x) => x.payload.session_id === sessao.id), "séries órfãs");
  assert.deepEqual(sets.map((x) => x.payload.weight_kg).sort((a, b) => a - b), [80, 82.5, 85]);

  const criacaoDaSessao = enviados.find((x) => x.table === "workout_sessions" && x.op === "insert");
  assert.equal(criacaoDaSessao.payload.user_id, "user-1");
});

test("o cache local continua íntegro depois do flush", async () => {
  // Se esvaziasse aqui, a tela ficaria vazia logo após sincronizar
  const sets = await db.session_sets.where("session_exercise_id").equals(exercicio.id).toArray();
  assert.equal(sets.length, 3);
});
