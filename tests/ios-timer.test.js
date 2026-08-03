// O descanso espelhado no timer nativo do iPhone.
//
// É o único jeito de um PWA colocar contagem viva na tela bloqueada / Dynamic
// Island: quem desenha é o app Relógio, disparado pelo app Atalhos via URL.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fakeWindow, setNavigator, load } = require("./helpers/setup");

const win = fakeWindow({ location: { href: "https://fitsec.app/sessao/ativa" } });
setNavigator({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari" });

const ios = load("ios-timer");

test("a URL passa os segundos como entrada do atalho", () => {
  assert.equal(
    ios.buildShortcutUrl(90),
    "shortcuts://run-shortcut?name=Descanso&input=text&text=90"
  );
});

test("nome com espaço/acento é escapado", () => {
  assert.equal(
    ios.buildShortcutUrl(60, "Descanso da Série"),
    "shortcuts://run-shortcut?name=Descanso%20da%20S%C3%A9rie&input=text&text=60"
  );
});

test("segundos quebrados são arredondados e nunca vão a zero", () => {
  assert.match(ios.buildShortcutUrl(89.6), /text=90$/);
  assert.match(ios.buildShortcutUrl(0), /text=1$/);
});

test("desligado por padrão — não sequestra o app sem você pedir", () => {
  win.location.href = "https://fitsec.app/sessao/ativa";
  assert.equal(ios.isIosTimerEnabled(), false);
  assert.equal(ios.startIosTimer(90), false);
  assert.equal(win.location.href, "https://fitsec.app/sessao/ativa", "não navegou");
});

test("ligado, dispara o atalho com o nome configurado", () => {
  ios.setIosTimerEnabled(true);
  ios.setShortcutName("Treino");
  assert.equal(ios.startIosTimer(120), true);
  assert.equal(win.location.href, "shortcuts://run-shortcut?name=Treino&input=text&text=120");
});

test("nome em branco volta para o padrão", () => {
  ios.setShortcutName("   ");
  assert.equal(ios.getShortcutName(), "Descanso");
});

test("fora do iPhone não tenta — lá o scheme não existe", () => {
  setNavigator({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome" });
  win.location.href = "https://fitsec.app/sessao/ativa";
  assert.equal(ios.startIosTimer(90), false);
  assert.equal(win.location.href, "https://fitsec.app/sessao/ativa");

  // ...mas o botão "Testar" força, para dar pra depurar em qualquer aparelho
  assert.equal(ios.startIosTimer(10, true), true);
});
