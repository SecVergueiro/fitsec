// O modo rápido só substitui o Notas do iPhone se aceitar o que a pessoa
// realmente digita: com vírgula decimal, com "kg", com × em vez de x, e com
// as séries em linhas separadas do nome do exercício.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/setup");

const { parseQuickLog, matchExercise, normalizeName } = load("quick-log");

test("linha com nome e séries", () => {
  const { exercises, unparsed } = parseQuickLog("Supino reto 80x8 80x7 75x8");
  assert.equal(unparsed.length, 0);
  assert.equal(exercises.length, 1);
  assert.equal(exercises[0].name, "Supino reto");
  assert.deepEqual(
    exercises[0].sets.map((s) => [s.weight, s.reps]),
    [[80, 8], [80, 7], [75, 8]]
  );
});

test("nome numa linha, séries nas seguintes", () => {
  const { exercises } = parseQuickLog("Remada curvada\n60x10\n60x10 55x12");
  assert.equal(exercises.length, 1);
  assert.equal(exercises[0].sets.length, 3);
});

test("peso x reps x séries expande em séries iguais", () => {
  const { exercises } = parseQuickLog("Agachamento 100x5x3");
  assert.equal(exercises[0].sets.length, 3);
  assert.deepEqual(exercises[0].sets[2], { weight: 100, reps: 5, rir: null });
});

test("vírgula decimal vira ponto, vírgula separadora vira separador", () => {
  const decimal = parseQuickLog("Rosca 12,5x10");
  assert.equal(decimal.exercises[0].sets[0].weight, 12.5);

  const separador = parseQuickLog("Rosca 12x10, 12x9");
  assert.equal(separador.exercises[0].sets.length, 2, "duas séries, não um decimal");
  assert.equal(separador.exercises[0].sets[1].reps, 9);
});

test("aceita ×, kg e maiúsculas", () => {
  const { exercises, unparsed } = parseQuickLog("LEG PRESS 200kg × 12");
  assert.equal(unparsed.length, 0);
  assert.equal(exercises[0].name, "LEG PRESS");
  assert.deepEqual(exercises[0].sets[0], { weight: 200, reps: 12, rir: null });
});

test("RIR colado e solto", () => {
  const colado = parseQuickLog("Supino 80x8@2");
  assert.equal(colado.exercises[0].sets[0].rir, 2);

  const solto = parseQuickLog("Supino 80x8 @1");
  assert.equal(solto.exercises[0].sets[0].rir, 1);
});

test("peso corporal: só reps, peso 0", () => {
  const { exercises } = parseQuickLog("Barra fixa x12 x10 x8");
  assert.equal(exercises[0].sets.length, 3);
  assert.equal(exercises[0].sets[0].weight, 0);
  assert.equal(exercises[0].sets[0].reps, 12);
});

test("mesmo exercício citado de novo acumula em vez de duplicar", () => {
  const { exercises } = parseQuickLog("Supino 80x8\nRemada 60x10\nsupino 75x9");
  assert.equal(exercises.length, 2);
  assert.equal(exercises[0].sets.length, 2, "as duas séries de supino no mesmo exercício");
});

test("lixo depois da primeira série é reportado, não engolido", () => {
  const { exercises, unparsed } = parseQuickLog("Supino 80x8 travou 80x7");
  assert.equal(exercises[0].sets.length, 2, "as séries válidas entram");
  assert.equal(unparsed.length, 1);
  assert.equal(unparsed[0].text, "travou");
});

test("séries antes de qualquer nome não somem em silêncio", () => {
  const { exercises, unparsed } = parseQuickLog("80x8 80x7");
  assert.equal(exercises.length, 0);
  assert.equal(unparsed.length, 1, "o usuário precisa saber que não salvou");
});

test("exercício sem nenhuma série não é salvo", () => {
  const { exercises } = parseQuickLog("Supino\nRemada 60x10");
  assert.deepEqual(exercises.map((e) => e.name), ["Remada"]);
});

test("bullets e linhas vazias não incomodam", () => {
  const { exercises, unparsed } = parseQuickLog("- Supino 80x8\n\n• Remada 60x10\n");
  assert.equal(unparsed.length, 0);
  assert.deepEqual(exercises.map((e) => e.name), ["Supino", "Remada"]);
});

test("texto vazio devolve nada, sem lançar", () => {
  assert.deepEqual(parseQuickLog(""), { exercises: [], unparsed: [] });
  assert.deepEqual(parseQuickLog("   \n\n  "), { exercises: [], unparsed: [] });
});

test("reps absurdo não vira série", () => {
  const { exercises, unparsed } = parseQuickLog("Supino 80x9999");
  assert.equal(exercises.length, 0);
  assert.equal(unparsed.length, 1);
});

// ── matchExercise ──────────────────────────────────────────────

const CATALOGO = [
  { id: "1", name: "Supino reto com barra" },
  { id: "2", name: "Supino inclinado com halteres" },
  { id: "3", name: "Remada curvada" },
  { id: "4", name: "Agachamento livre" },
];

test("casa nome exato ignorando acento e caixa", () => {
  assert.equal(matchExercise("REMADA CURVADA", CATALOGO).id, "3");
  assert.equal(matchExercise("agachamento livre", CATALOGO).id, "4");
});

test("casa por prefixo, preferindo o nome mais curto", () => {
  assert.equal(matchExercise("Supino reto", CATALOGO).id, "1");
  assert.equal(matchExercise("Supino incl", CATALOGO).id, "2");
});

test("nome desconhecido não casa com nada — a UI oferece criar", () => {
  assert.equal(matchExercise("Elevação pélvica", CATALOGO), null);
  assert.equal(matchExercise("", CATALOGO), null);
});

test("normalizeName tira acento, caixa e espaço duplo", () => {
  assert.equal(normalizeName("  Elevação   LATERAL "), "elevacao lateral");
});
