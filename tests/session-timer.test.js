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

test("finalizar o treino não deixa lixo para o próximo", () => {
  const agora = 1_700_000_000_000;
  st.saveRest({ sessionId: SESSAO, endAt: agora + 90_000, total: 90 });
  st.saveActiveIdx(SESSAO, 2);
  st.clearSessionState();
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
