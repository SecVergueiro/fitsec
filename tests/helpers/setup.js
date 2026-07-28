// Utilidades comuns aos testes.
//
// Os módulos de lib/ são compilados para .test-build/ pelo script `pretest`.
// Aqui montamos o pouco de ambiente de navegador que eles esperam e trocamos
// lib/supabase por um servidor falso.

const Module = require("module");
const path = require("path");

const BUILD = path.join(__dirname, "..", "..", ".test-build");
const STUB = require.resolve("./stub-supabase.js");

let patched = false;

/**
 * Faz `require("./supabase")` de dentro de .test-build resolver para o stub.
 * Precisa rodar antes do primeiro require dos módulos compilados.
 */
function stubSupabase() {
  if (!patched) {
    const original = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, ...rest) {
      if (request === "./supabase" && parent && parent.filename && parent.filename.startsWith(BUILD)) {
        return STUB;
      }
      return original.call(this, request, parent, ...rest);
    };
    patched = true;
  }
  return require(STUB);
}

/** `navigator` é getter nativo no Node — atribuição direta não pega. */
function setNavigator(props) {
  Object.defineProperty(globalThis, "navigator", {
    value: props,
    writable: true,
    configurable: true,
  });
}

/** lib/offline-db só instancia o Dexie quando `window` existe. */
function fakeWindow(extra = {}) {
  const store = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    ...extra,
  };
  return global.window;
}

/** Carrega um módulo compilado de lib/, ex.: load("offline-writes"). */
function load(nome) {
  return require(path.join(BUILD, `${nome}.js`));
}

/** Recarrega do zero (limpa o cache) — útil para testar guards de ambiente. */
function reload(nome) {
  const file = path.join(BUILD, `${nome}.js`);
  delete require.cache[require.resolve(file)];
  return require(file);
}

module.exports = { BUILD, stubSupabase, setNavigator, fakeWindow, load, reload };
