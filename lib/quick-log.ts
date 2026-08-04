// Parser do modo rápido — o "Notas do iPhone" com um banco atrás.
//
// Por que existe: com prescrição, sugestão de carga, RIR e toggles, registrar
// um treino que fugiu da ficha (ou anotar depois, no vestiário) dá mais
// trabalho que abrir o Notas e digitar "supino 80x8 80x7". Então aceitamos
// exatamente esse texto e transformamos em séries de verdade.
//
// Formatos aceitos por linha:
//   Supino reto 80x8 80x7 75x8      → 3 séries
//   Supino reto 80x8x3              → 3 séries iguais de 80×8
//   Supino 82,5x8 @2                → decimal com vírgula, RIR 2
//   Barra fixa x12 x10              → peso 0 (peso corporal)
//   Supino                          → só o nome; as séries podem vir nas
//   80x8 80x7                         linhas seguintes
//
// Nada aqui toca em window/rede: é função pura, testada em tests/quick-log.

export interface ParsedSet {
  weight: number;
  reps: number;
  rir: number | null;
}

export interface ParsedExercise {
  name: string;
  sets: ParsedSet[];
}

export interface ParseResult {
  exercises: ParsedExercise[];
  /** Pedaços que não viraram série — mostrados no preview para o usuário corrigir. */
  unparsed: { line: number; text: string }[];
}

const MAX_REPS = 300;
const MAX_WEIGHT = 999;

/** Normaliza para comparar nomes: sem acento, sem caixa, sem espaço duplo. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    // 0300-036f = acentos combinantes.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Vírgula decimal só quando é claramente decimal: seguida de UM dígito que não
 * é seguido de outro dígito. Assim "82,5x8" vira 82.5 e "80x8, 80x7" continua
 * sendo dois tokens separados.
 */
function normalizeLine(raw: string): string {
  return (
    raw
      .replace(/[×✕✖]/g, "x")
      .replace(/(\d),(\d)(?!\d)/g, "$1.$2")
      .replace(/[,;]/g, " ")
      // "80kg x 8" — sem \b na frente porque "0k" não é fronteira de palavra.
      .replace(/kgs?\b/gi, " ")
      .trim()
  );
}

const NUMBER_RE = /^\d+(?:\.\d+)?$/;

/**
 * Junta a série que o usuário digitou com espaços: "200 x 12", "200 x12",
 * "200x 12" → "200x12".
 *
 * Tem que ser por token, não por regex na linha: em "Barra fixa x12 x10" um
 * `(\d)\s*x\s*(\d)` global colaria "2 x1" e transformaria as duas séries de
 * peso corporal em um token sem sentido. Aqui "x12" só cola no que vem antes
 * se o anterior for um número solto.
 */
function mergeSetTokens(tokens: string[]): string[] {
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = out[out.length - 1] ?? "";
    const next = tokens[i + 1] ?? "";

    if (/^x$/i.test(token) && NUMBER_RE.test(prev) && NUMBER_RE.test(next)) {
      out[out.length - 1] = `${prev}x${next}`;
      i++;
      continue;
    }
    if (/^x\d+$/i.test(token) && NUMBER_RE.test(prev)) {
      out[out.length - 1] = `${prev}x${token.slice(1)}`;
      continue;
    }
    if (/^\d+(?:\.\d+)?x$/i.test(token) && NUMBER_RE.test(next)) {
      out.push(`${token.slice(0, -1)}x${next}`);
      i++;
      continue;
    }
    out.push(token);
  }

  return out;
}

/**
 * Parece tentativa de série? Usado para não engolir "80x9999" como se fosse
 * parte do nome do exercício — erro de digitação tem que aparecer no preview.
 */
function looksLikeSet(token: string): boolean {
  return /^\d*\.?\d*x\d/i.test(token);
}

const SET_RE = /^(\d+(?:\.\d+)?)x(\d+)(?:x(\d+))?$/i;
const BODYWEIGHT_RE = /^x(\d+)$/i;
const RIR_RE = /^@(\d+)$/;

interface TokenSets {
  sets: ParsedSet[];
  /** RIR solto (`@2`) aplica na última série já lida. */
  rirOnly?: number;
}

/** Interpreta um token. `null` = não é série nem RIR. */
function parseToken(token: string): TokenSets | null {
  const rirMatch = RIR_RE.exec(token);
  if (rirMatch) {
    const rir = Number(rirMatch[1]);
    return rir <= 10 ? { sets: [], rirOnly: rir } : null;
  }

  // RIR colado: "80x8@2"
  let rir: number | null = null;
  const at = token.indexOf("@");
  if (at > 0) {
    const tail = Number(token.slice(at + 1));
    if (!Number.isInteger(tail) || tail < 0 || tail > 10) return null;
    rir = tail;
    token = token.slice(0, at);
  }

  const bw = BODYWEIGHT_RE.exec(token);
  if (bw) {
    const reps = Number(bw[1]);
    if (reps < 1 || reps > MAX_REPS) return null;
    return { sets: [{ weight: 0, reps, rir }] };
  }

  const m = SET_RE.exec(token);
  if (!m) return null;

  const weight = Number(m[1]);
  const reps = Number(m[2]);
  const repeat = m[3] ? Number(m[3]) : 1;

  if (weight < 0 || weight > MAX_WEIGHT) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) return null;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) return null;

  return { sets: Array.from({ length: repeat }, () => ({ weight, reps, rir })) };
}

/** Texto livre → exercícios com séries. Nunca lança. */
export function parseQuickLog(text: string): ParseResult {
  const exercises: ParsedExercise[] = [];
  const unparsed: ParseResult["unparsed"] = [];
  let current: ParsedExercise | null = null;

  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, i) => {
    const line = normalizeLine(rawLine.replace(/^\s*[-*•]\s*/, ""));
    if (!line) return;

    const tokens = mergeSetTokens(line.split(/\s+/));
    const nameParts: string[] = [];
    const sets: ParsedSet[] = [];
    let started = false;

    for (const token of tokens) {
      const parsed = parseToken(token);
      if (!parsed) {
        // Depois da primeira série, ou com cara de série malformada, é lixo e
        // tem que aparecer no preview. Antes disso, é parte do nome.
        if (started || looksLikeSet(token)) unparsed.push({ line: i + 1, text: token });
        else nameParts.push(token);
        continue;
      }
      started = true;
      if (parsed.rirOnly != null) {
        const last = sets[sets.length - 1];
        if (last) last.rir = parsed.rirOnly;
        continue;
      }
      sets.push(...parsed.sets);
    }

    const name = nameParts.join(" ").trim();

    if (name) {
      // Mesmo nome citado de novo (ex.: voltou nele no fim do treino) acumula
      // no mesmo exercício em vez de criar um duplicado.
      const existing = exercises.find((e) => normalizeName(e.name) === normalizeName(name));
      current = existing ?? { name, sets: [] };
      if (!existing) exercises.push(current);
      current.sets.push(...sets);
      return;
    }

    if (sets.length === 0) return;

    if (!current) {
      // Séries sem exercício nenhum antes — sem nome não há o que salvar.
      unparsed.push({ line: i + 1, text: rawLine.trim() });
      return;
    }
    current.sets.push(...sets);
  });

  return { exercises: exercises.filter((e) => e.sets.length > 0), unparsed };
}

/**
 * Casa um nome digitado com o catálogo. Exato → começa com → contém.
 * Devolve null quando não dá pra ter confiança — aí a UI oferece criar.
 */
export function matchExercise<T extends { id: string; name: string }>(
  name: string,
  catalog: T[]
): T | null {
  const target = normalizeName(name);
  if (!target) return null;

  const normalized = catalog.map((e) => ({ e, n: normalizeName(e.name) }));

  const exact = normalized.find((c) => c.n === target);
  if (exact) return exact.e;

  // Prefixo: "supino incl" → "Supino inclinado com halteres"
  const prefixed = normalized
    .filter((c) => c.n.startsWith(target) || target.startsWith(c.n))
    .sort((a, b) => a.n.length - b.n.length);
  if (prefixed.length > 0) return prefixed[0].e;

  const contained = normalized
    .filter((c) => c.n.includes(target) || target.includes(c.n))
    .sort((a, b) => a.n.length - b.n.length);
  if (contained.length > 0) return contained[0].e;

  return null;
}
