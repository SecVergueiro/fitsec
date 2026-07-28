// A sessão persistida é lida direto do localStorage porque `auth.getUser()`
// sempre bate na rede e `auth.getSession()` força refresh quando o token venceu
// (1h). Offline os dois devolvem null — era isso que jogava o app pro /login e
// gravava mutações sem user_id, que a RLS depois rejeitava.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { fakeWindow, load } = require("./helpers/setup");

fakeWindow();
const cache = load("auth-cache");
const store = () => global.window.localStorage;

const SESSAO = {
  access_token: "eyJhbGciOi...",
  refresh_token: "abc123",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: { id: "11111111-2222-3333-4444-555555555555", email: "eu@exemplo.com" },
};

beforeEach(() => store().removeItem(cache.AUTH_STORAGE_KEY));

test("sem sessão gravada = deslogado", () => {
  assert.equal(cache.readPersistedUser(), null);
  assert.equal(cache.hasPersistedSession(), false);
});

test("lê o usuário da sessão gravada", () => {
  store().setItem(cache.AUTH_STORAGE_KEY, JSON.stringify(SESSAO));
  assert.equal(cache.readPersistedUserId(), SESSAO.user.id);
  assert.equal(cache.isAccessTokenExpired(), false);
});

test("token vencido ainda devolve o usuário", () => {
  // O caso que derrubava o app offline: getSession() devolveria null aqui.
  store().setItem(
    cache.AUTH_STORAGE_KEY,
    JSON.stringify({ ...SESSAO, expires_at: Math.floor(Date.now() / 1000) - 60 })
  );
  assert.equal(cache.readPersistedUserId(), SESSAO.user.id);
  assert.equal(cache.isAccessTokenExpired(), true);
});

test("aceita o formato antigo aninhado em currentSession", () => {
  store().setItem(cache.AUTH_STORAGE_KEY, JSON.stringify({ currentSession: SESSAO }));
  assert.equal(cache.readPersistedUserId(), SESSAO.user.id);
});

test("lixo no storage não explode", () => {
  store().setItem(cache.AUTH_STORAGE_KEY, "{nao-e-json");
  assert.equal(cache.readPersistedUser(), null);

  store().setItem(cache.AUTH_STORAGE_KEY, JSON.stringify({ access_token: "x" })); // sem user
  assert.equal(cache.readPersistedUser(), null);
});

test("clearPersistedSession desloga", () => {
  store().setItem(cache.AUTH_STORAGE_KEY, JSON.stringify(SESSAO));
  cache.clearPersistedSession();
  assert.equal(cache.hasPersistedSession(), false);
});
