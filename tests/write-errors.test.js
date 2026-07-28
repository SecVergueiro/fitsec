// Mensagem de erro das escritas e o toast global.
//
// O toast escuta `unhandledrejection` em vez de exigir try/catch nas ~40
// chamadas de escrita. A propriedade que faz isso funcionar: rejeição COM
// handler não dispara o evento, então as telas que já tratam o erro não
// ganham um toast duplicado.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { setNavigator, stubSupabase, load } = require("./helpers/setup");

setNavigator({ onLine: true });
stubSupabase();
const { describeWriteError, ServerRejectedError: Err } = load("offline-writes");

const raiz = path.join(__dirname, "..");
const ler = (p) => readFileSync(path.join(raiz, p), "utf8");

test("mensagem por tabela e operação", () => {
  assert.equal(
    describeWriteError(new Err("session_sets", "update", { status: 400, code: "42703" })),
    "Não deu pra salvar a série — o servidor recusou"
  );
  assert.equal(
    describeWriteError(new Err("workout_sessions", "delete", { status: 400 })),
    "Não deu pra remover o treino — o servidor recusou"
  );
});

test("constraint duplicada vira mensagem útil", () => {
  assert.equal(
    describeWriteError(new Err("exercises", "insert", { status: 409, code: "23505" })),
    "O exercício já existe com esse nome"
  );
});

test("chave estrangeira quebrada é explicada", () => {
  assert.match(
    describeWriteError(new Err("template_exercises", "insert", { status: 409, code: "23503" })),
    /depende de um registro que não existe mais$/
  );
});

test("tabela desconhecida tem texto genérico", () => {
  assert.equal(
    describeWriteError(new Err("tabela_nova", "insert", { status: 400 })),
    "Não deu pra criar a alteração — o servidor recusou"
  );
});

test("erro comum passa a própria mensagem", () => {
  assert.equal(describeWriteError(new Error("boom")), "boom");
});

test("o componente do toast está fiado corretamente", () => {
  const comp = ler("components/WriteErrorToast.tsx");
  assert.match(comp, /reason\?\.name !== "ServerRejectedError"/, "filtra só o erro de escrita");
  assert.match(comp, /event\.preventDefault\(\)/, "silencia o console");
  assert.match(comp, /removeEventListener/, "limpa o listener no unmount");
  assert.match(ler("components/Providers.tsx"), /<WriteErrorToast \/>/, "montado no ToastProvider");
});

test("o nome do erro casa com o filtro do componente", () => {
  // Acoplamento silencioso: renomear a classe faz o toast parar de aparecer
  // sem quebrar nada em tempo de compilação.
  const nome = new Err("exercises", "insert", {}).name;
  assert.equal(nome, "ServerRejectedError");
  assert.ok(
    ler("components/WriteErrorToast.tsx").includes(`!== "${nome}"`),
    "o componente filtra por um nome diferente do que a classe usa"
  );
});

test("rejeição sem handler dispara o evento; com handler, não", () => {
  // Roda num processo separado: o runner do Node reprova qualquer teste que
  // gere uma rejeição não tratada, e é exatamente isso que precisamos provocar.
  const script = `
    const capturados = [];
    process.on("unhandledRejection", (r) => {
      if (r && r.name === "ServerRejectedError") capturados.push(r.table);
    });
    class E extends Error {
      constructor(table) { super("recusado"); this.name = "ServerRejectedError"; this.table = table; }
    }
    Promise.reject(new E("sem-try-catch"));                       // vira toast global
    (async () => { try { await Promise.reject(new E("com-try-catch")); } catch {} })(); // a tela trata
    Promise.reject(new TypeError("erro alheio"));                 // ignorado pelo filtro
    setTimeout(() => console.log(JSON.stringify(capturados)), 80);
  `;
  const saida = execFileSync(process.execPath, ["-e", script], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(saida.trim()), ["sem-try-catch"]);
});
