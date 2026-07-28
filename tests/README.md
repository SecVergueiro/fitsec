# Testes

```bash
npm run build   # necessário para os testes de service worker e precache
npm test
```

`npm test` roda um `pretest` que compila `lib/**/*.ts` para `.test-build/`
(CommonJS) via `tsconfig.test.json`. Os testes carregam esses módulos
compilados — nada de framework extra, só o `node:test` embutido.

## O que cada arquivo cobre

| Arquivo | Cobre |
|---|---|
| `auth-cache.test.js` | Leitura da sessão persistida sem rede, inclusive com token vencido |
| `offline-reads.test.js` | `offlineRead` cair pro cache, `preferLocal`, timeout |
| `offline-writes.test.js` | O que vai pra fila e o que estoura pra UI |
| `write-errors.test.js` | Mensagens de erro e a fiação do toast global |
| `rest-alert.test.js` | Bipe de fim de descanso e wake lock |
| `precache.test.js` | Rotas estáticas e assets no precache do service worker |
| `sw-offline.test.js` | O `public/sw.js` real, executado com a rede caída |
| `offline-workout.e2e.test.js` | Treino inteiro offline → reconexão → sincronização |

## Por que estes testes existem

Todos vieram de bugs reais que deixavam o PWA inutilizável no iPhone. Se algum
falhar, provavelmente é uma regressão de um destes:

- **O service worker ignorava `/_next/`.** Como todas as páginas são
  `"use client"`, o HTML em cache abria em branco sem os chunks.
  → `precache.test.js`, `sw-offline.test.js`
- **`getSession()` força refresh com o token vencido** (1h). Offline isso
  falha e jogava o usuário no `/login`. → `auth-cache.test.js`
- **O supabase-js resolve erro de rede com `{ data: null, error }`** em vez de
  rejeitar, então todo `try/catch` de fallback era código morto.
  → `offline-reads.test.js`
- **Rotas dinâmicas (`ƒ`) não existem offline.** As telas de treino usam
  `?id=` numa rota estática justamente por isso. → `precache.test.js`
- **`user_id` ausente** fazia a RLS rejeitar no flush e o treino sumia.
  → `offline-workout.e2e.test.js`

## Notas

- `tests/helpers/stub-supabase.js` imita o formato de erro do supabase-js
  (resolve com `status: 0`, não rejeita). Se ele divergir da biblioteca real,
  os testes passam e a produção quebra — vale conferir ao atualizar o
  `@supabase/supabase-js`.
- `precache.test.js` e `sw-offline.test.js` leem o build. Sem `.next`, o
  primeiro é pulado; o segundo falha avisando.
- O que **não** é coberto: renderização em navegador. Nenhum teste abre uma
  tela. Se a UI quebrar offline sem quebrar os dados, esta suíte passa.
