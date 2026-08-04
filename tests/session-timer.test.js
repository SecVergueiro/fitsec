// O descanso tem que sobreviver ao iOS matando o PWA no meio do treino.
//
// Antes o `restEndAt` só existia em useState: bastava trocar pro Spotify e
// voltar para o app recarregar do zero e o descanso simplesmente sumir.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fakeWindow, load } = require("./helpers/setup");

fakeWindow();
const st = load("session-timer");

const SESSAO = "11111111-1111-1111-1111-111111111111";
const OUTRA = "22222222-2222-2222-2222-222222222222";

test("descanso volta com o tempo que falta, não do zero", () => {
  const agora = 1_700_000_000_000;
  st.saveRest({ sessionId: SESSAO, endAt: agora + 90_000, total: 120 });

  // 30 s depois o app reinicia
  const voltou = st.loadRest(SESSAO, agora + 30_000);
  assert.ok(voltou);
  assert.equal(voltou.endAt - (agora + 30_000), 60_000, "faltam 60 s");
  assert.equal(voltou.total, 120, "mantém o total para a barra de progresso");
});

test("descanso vencido enquanto o app estava morto é descartado", () => {
  const agora = 1_700_000_000_000;
  st.saveRest({ sessionId: SESSAO, endAt: agora + 10_000, total: 60 });
  assert.equal(st.loadRest(SESSAO, agora + 11_000), null);
  // e não fica lixo para a próxima leitura
  assert.equal(st.loadRest(SESSAO, agora), null);
});

test("não restaura descanso de outra sessão", () => {
  const agora = 1_700_000_000_000;
  st.saveRest({ sessionId: OUTRA, endAt: agora + 90_000, total: 90 });
  assert.equal(st.loadRest(SESSAO, agora), null);
  st.clearRest();
});

test("reabre no exercício em que você estava", () => {
  st.saveActiveIdx(SESSAO, 4);
  assert.equal(st.loadActiveIdx(SESSAO), 4);
  assert.equal(st.loadActiveIdx(OUTRA), null, "índice não vaza entre sessões");
});

// Reabrir o app já dentro do treino é o que apaga a diferença contra o
// Notas+Timer: zero tap e zero leitura de banco no cold start.
test("reabrir o app volta pro treino em andamento", () => {
  const agora = 1_700_000_000_000;
  st.saveActiveSession(SESSAO, agora);

  const voltou = st.loadActiveSession(4 * 60 * 60 * 1000, agora + 10 * 60_000);
  assert.ok(voltou);
  assert.equal(voltou.sessionId, SESSAO);
});

test("treino esquecido aberto não sequestra a abertura do app", () => {
  const agora = 1_700_000_000_000;
  st.saveActiveSession(SESSAO, agora);

  const limite = 4 * 60 * 60 * 1000;
  assert.equal(st.loadActiveSession(limite, agora + limite + 1), null);
  assert.equal(
    st.loadActiveSession(limite, agora + limite + 2),
    null,
    "e a marca vencida é descartada, não fica tentando de novo"
  );
});

test("marca de treino corrompida não redireciona pra lugar nenhum", () => {
  window.localStorage.setItem("fitsec_active_session_v1", '{"sessionId":123}');
  assert.equal(st.loadActiveSession(60_000), null);
});

test("finalizar o treino não deixa lixo para o próximo", () => {
  const agora = 1_700_000_000_000;
  st.saveRest({ sessionId: SESSAO, endAt: agora + 90_000, total: 90 });
  st.saveActiveIdx(SESSAO, 2);
  st.saveActiveSession(SESSAO, 1_700_000_000_000);
  st.clearSessionState();
  assert.equal(st.loadActiveSession(60_000, 1_700_000_000_000), null, "não retoma um treino já encerrado");
  assert.equal(st.loadRest(SESSAO, agora), null);
  assert.equal(st.loadActiveIdx(SESSAO), null);
});

test("localStorage corrompido ou bloqueado não quebra a sessão", () => {
  window.localStorage.setItem("fitsec_rest_v1", "{lixo");
  assert.equal(st.loadRest(SESSAO, Date.now()), null);

  const original = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
  assert.doesNotThrow(() => st.saveRest({ sessionId: SESSAO, endAt: Date.now() + 1000, total: 60 }));
  window.localStorage.setItem = original;
});
