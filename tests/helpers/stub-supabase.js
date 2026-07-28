// Servidor falso no lugar de lib/supabase.
//
// O ponto central: o supabase-js **resolve** erros de rede com
// `{ data: null, error: { status: 0, ... } }` em vez de rejeitar. Era isso que
// tornava todo `try/catch` de fallback offline em código morto, então o stub
// precisa reproduzir esse formato fielmente.

const estado = {
  online: true,
  sessaoValida: true,
  /** erro a devolver mesmo online — para testar recusa do servidor */
  erroForcado: null,
  /** tudo que o "servidor" gravou, em ordem */
  recebidos: [],
};

const ERRO_REDE = {
  message: "TypeError: Failed to fetch",
  details: "",
  hint: "",
  code: "",
  status: 0,
};

function reset() {
  estado.online = true;
  estado.sessaoValida = true;
  estado.erroForcado = null;
  estado.recebidos.length = 0;
}

function query(table, op) {
  const q = {
    _rows: null,
    _match: {},
    insert(rows) { q._rows = rows; return q; },
    update(patch) { q._rows = patch; return q; },
    delete() { return q; },
    select() { return q; },
    single() { return q; },
    maybeSingle() { return q; },
    eq(k, v) { q._match[k] = v; return q; },
    neq() { return q; },
    not() { return q; },
    order() { return q; },
    limit() { return q; },
    in() { return q; },
    filter() { return q; },
    then(resolve) {
      if (!estado.online) return resolve({ data: null, error: ERRO_REDE });
      if (estado.erroForcado) return resolve({ data: null, error: estado.erroForcado });
      estado.recebidos.push({ table, op, payload: q._rows, match: q._match });
      return resolve({ data: q._rows ?? {}, error: null });
    },
  };
  return q;
}

const supabase = {
  from(table) {
    return {
      insert: (rows) => query(table, "insert").insert(rows),
      update: (patch) => query(table, "update").update(patch),
      delete: () => query(table, "delete").delete(),
      select: () => query(table, "select").select(),
    };
  },
  auth: {
    async getSession() {
      if (!estado.online || !estado.sessaoValida) {
        return { data: { session: null }, error: ERRO_REDE };
      }
      return { data: { session: { access_token: "tok", user: { id: "user-1" } } }, error: null };
    },
  },
};

module.exports = {
  supabase,
  estado,
  reset,
  ERRO_REDE,
  getCurrentUser: () => ({ id: "user-1" }),
  getCurrentUserId: () => "user-1",
};
