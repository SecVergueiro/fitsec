// Aviso de fim de descanso.
//
// `navigator.vibrate` não existe no WebKit, então no iPhone o timer terminava
// em silêncio. O bipe via Web Audio só sai se três coisas forem feitas certo:
// destravar o contexto dentro de um gesto, liberar o modo silencioso e manter
// a tela acesa.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setNavigator, load, reload } = require("./helpers/setup");

const osciladores = [];
class FakeGain {
  constructor() {
    this.gain = { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} };
  }
  connect(x) { return x; }
}
class FakeOsc {
  constructor() { this.frequency = {}; this._start = null; this._stop = null; }
  connect(x) { return x; }
  start(t) { this._start = t; osciladores.push(this); }
  stop(t) { this._stop = t; }
}
class FakeAudioContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = {};
    FakeAudioContext.criados++;
  }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  createOscillator() { return new FakeOsc(); }
  createGain() { return new FakeGain(); }
}
FakeAudioContext.criados = 0;

let wakeLockPedidos = 0;
const sentinel = { released: false, release: async () => { sentinel.released = true; } };

global.window = { AudioContext: FakeAudioContext };
setNavigator({
  vibrate: () => true,
  audioSession: { type: "auto" },
  wakeLock: { request: async () => { wakeLockPedidos++; sentinel.released = false; return sentinel; } },
});

const alerta = load("rest-alert");

test("armRestAlert cria o contexto uma vez só", () => {
  alerta.armRestAlert();
  alerta.armRestAlert();
  assert.equal(FakeAudioContext.criados, 1);
});

test("não rouba o áudio do Spotify", () => {
  // "playback" fazia o iOS PARAR a música dos outros apps ao acordar o
  // contexto. "transient" só abaixa o volume durante o bipe.
  assert.equal(navigator.audioSession.type, "transient");
});

test("toca dois bipes em sequência", async () => {
  await new Promise((r) => setTimeout(r, 10)); // deixa o resume() resolver
  await alerta.playRestAlert();
  assert.equal(osciladores.length, 2);
  assert.ok(osciladores[1]._start > osciladores[0]._start, "o segundo vem depois");
  assert.ok(osciladores.every((o) => o._stop > o._start), "cada bipe tem fim agendado");
});

test("dorme depois do bipe — não segura a audio session", async () => {
  assert.equal(alerta.isAudioAwake(), true, "acordado logo após tocar");
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(alerta.isAudioAwake(), false, "voltou a dormir, música liberada");
});

test("wake lock: pede, não duplica e solta", async () => {
  await alerta.acquireWakeLock();
  assert.equal(wakeLockPedidos, 1);
  assert.equal(alerta.hasWakeLock(), true);

  await alerta.acquireWakeLock();
  assert.equal(wakeLockPedidos, 1, "não pede de novo se já tem");

  await alerta.releaseWakeLock();
  assert.equal(alerta.hasWakeLock(), false);
});

test("navegador sem AudioContext, wakeLock nem vibrate não quebra", async () => {
  global.window = {};
  setNavigator({});
  const pelado = reload("rest-alert");

  await assert.doesNotReject(async () => {
    pelado.armRestAlert();
    await pelado.playRestAlert();
    await pelado.acquireWakeLock();
    await pelado.releaseWakeLock();
  });
  assert.equal(pelado.hasWakeLock(), false);
});
