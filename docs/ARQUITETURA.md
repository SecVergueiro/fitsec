# Arquitetura

Como o FitSec funciona por dentro. Para instalação e visão geral, veja o
[README](../README.md).

O fio condutor deste documento é um só: **o app precisa funcionar sem rede, e a
rede precisa ser tratada como algo que falha em silêncio.** Quase toda decisão
descrita aqui sai daí.

---

## O ambiente hostil

Vale começar pelo contexto, porque ele explica escolhas que fora dele pareceriam
exagero:

- A academia tem 4G ruim ou nenhum sinal.
- O celular fica bloqueado entre séries.
- **O iOS mata o PWA a cada troca de app.** Trocar a música já basta.

A terceira é a mais dura. Ela transforma o *cold start* no caminho mais
percorrido do app, não no mais raro. Um app que leva três segundos para pintar a
primeira tela é um app que leva três segundos **toda vez** que a pessoa volta do
Spotify.

---

## As três camadas de dados

```
  Tela  ──►  offline-reads / offline-writes  ──►  Dexie (IndexedDB)
                          │                              │
                          │                              ▼
                          └────────────────────►  sync-engine  ──►  Supabase
```

Nenhuma tela fala com o Supabase diretamente. Chamar `supabase.from(...)` numa
tela faz o recurso simplesmente parar de funcionar sem sinal — é a regra mais
importante do código.

### `lib/offline-db.ts` — o espelho local

IndexedDB via Dexie, com um espelho **parcial** do Postgres. Só o que é preciso
offline:

| Tabela local | Recorte |
| --- | --- |
| `workout_sessions` | últimos 30 dias |
| `session_exercises`, `session_sets` | das sessões em andamento |
| `exercises` | catálogo completo |
| `templates`, `template_days`, `template_exercises` | completo |
| `mesocycles` | completo |
| `user_profile` | a conta atual |
| `pending_mutations` | a fila de escrita |

O recorte é deliberado: espelhar anos de histórico encheria o armazenamento do
navegador para atender um caso raro. Histórico antigo exige rede.

### `lib/offline-reads.ts` — leitura em duas passadas

Uma tela pinta duas vezes. A primeira com `localOnly: true`, direto do
IndexedDB, em milissegundos. A segunda com a mesma função rodando contra o
servidor, **sem spinner**, atualizando o que mudou.

Telas com muitas leituras usam `makeReaders(localOnly)` para não repetir o
padrão à mão.

### `lib/offline-writes.ts` — escrita otimista

`offlineInsert`, `offlineUpdate` e `offlineDelete`. Com `{ optimistic: true }` a
função grava local, **devolve na hora** e manda pela fila.

Isso vale para todo o caminho crítico do treino: salvar série, adicionar
exercício, finalizar exercício, finalizar treino. O cronômetro de descanso
começa antes de qualquer `await`.

---

## O teto de 6 segundos

`navigator.onLine` responde se existe uma interface de rede ativa — não se
existe internet. No 4G ruim da academia ele diz `true`, o `fetch` sai e fica
pendurado até o timeout do sistema, que é longo demais para alguém parado entre
duas séries.

Por isso leitura e escrita têm teto próprio: `NETWORK_TIMEOUT_MS = 6000`
(`lib/offline-writes.ts`). Estourar o teto **não** é erro de tela — a operação
vai para a fila e a interface segue.

---

## O motor de sincronização

`lib/sync-engine.ts`, três operações:

| Operação | Papel |
| --- | --- |
| `pullSnapshot(userId)` | baixa do Supabase o recorte que o app precisa offline (janela de 60 dias) |
| `enqueue(...)` | registra uma mutação na fila local e agenda o flush |
| `flushQueue()` | envia as mutações pendentes, em ordem |

Mutações têm `attempts` e `last_error`, e são descartadas após `MAX_RETRIES = 5`.

### Três detalhes que só aparecem em uso real

Esta é a parte mais instrutiva do projeto. Os três problemas abaixo passam em
qualquer teste feito com internet boa, e destroem um treino em campo.

**1. O token vence enquanto o app está offline.**
Depois de um tempo sem rede, o access token do Supabase está vencido. Sem
renovar antes de esvaziar a fila, *cada* mutação tomaria `401` e queimaria uma
das cinco tentativas — o treino inteiro seria descartado **justamente no momento
de reconectar**, que é quando ele deveria ser salvo. O flush começa chamando
`supabase.auth.getSession()`, que renova se necessário.

**2. A ordem da fila é o `id`, não o horário.**
Várias mutações caem no mesmo milissegundo: ao iniciar uma sessão, ela e todos
os seus `session_exercises` saem em rajada. Ordenar por `created_at` deixava o
empate indefinido, e se um `session_set` fosse enviado antes do
`session_exercise` a que pertence, o servidor recusava por chave estrangeira — a
série queimava as tentativas até sumir. A fila é ordenada pelo `id`
autoincremental, que é a ordem real de criação.

**3. Insert repetido usa `upsert`.**
Uma escrita que estourou o teto de 6 segundos foi para a fila, mas o `fetch`
original **continuou correndo** e pode ter gravado. Como o payload sempre carrega
o `id`, um `insert` repetido tomaria `23505` (violação de unicidade) e queimaria
as tentativas até a linha ser descartada. Usar `upsert` torna o reenvio
idempotente.

O padrão comum aos três: o modo de falha não é "dá erro na tela", é **perder
dado em silêncio no pior momento possível**. Por isso a fila é a parte mais
testada do projeto.

---

## O service worker é gerado no build

`scripts/gen-sw.mjs` roda no fim do `npm run build` e monta `public/sw.js` a
partir de `scripts/sw-template.js`, injetando a lista de precache do build atual.

Precisa ser gerado porque o app é praticamente todo client-side: sem os chunks de
`/_next/static` no Cache API, a página cacheada abriria **em branco** offline. A
lista muda a cada build, junto com os hashes dos arquivos — escrever isso à mão
significaria um app offline quebrado a cada deploy.

---

## O descanso na tela bloqueada

`lib/ios-timer.ts`.

Um PWA não alcança Live Activities — o card vivo na Dynamic Island e na tela
bloqueada é ActivityKit, API nativa fora do alcance da web. Mas o timer do app
Relógio aparece exatamente naquele lugar, e o app Atalhos pode iniciá-lo por URL
scheme.

Então, no começo do descanso, o FitSec dispara `shortcuts://run-shortcut` com a
duração — e quem mostra a contagem é o próprio iOS.

O custo é honesto e por isso o recurso vem **desligado**: exige um atalho criado
uma vez no iPhone, com nome exato (`Descanso` por padrão), e causa uma piscada
de cerca de um segundo no app Atalhos ao iniciar o descanso.

Em paralelo, `lib/session-timer.ts` mantém descanso, exercício aberto e treino em
andamento no `localStorage` — é o que faz o estado sobreviver ao PWA ser morto
pelo iOS.

---

## Modelo de dados

| Tabela | Papel |
| --- | --- |
| `exercises` | biblioteca global: seed + exercícios do usuário |
| `templates` | fichas de treino (UL+PPL, ABC…) |
| `template_days` | dias dentro de um template (Upper, Lower, Push…) |
| `template_exercises` | exercícios prescritos por dia: séries, reps, RIR, descanso |
| `mesocycles` | blocos de periodização vinculados a um template |
| `workout_sessions` | sessões executadas; `completed_at IS NULL` = em andamento |
| `session_exercises` | cópia dos `template_exercises` no início da sessão |
| `session_sets` | cada série registrada (peso, reps, RIR) — a tabela central |
| `user_profiles` | perfil e peso corporal |

Views: `set_estimated_1rm` (Epley), `personal_records`, `weekly_volume`.

**Por que `session_exercises` é uma cópia.** Se a sessão apontasse direto para
`template_exercises`, editar a ficha mudaria retroativamente o que já foi
treinado. Copiar no início congela a prescrição daquele dia — o histórico passa a
registrar o que de fato foi feito, não o que a ficha diz hoje.

### Fluxo de uma sessão

1. A tela detecta o dia do template ativo pelo `weekday` e chama
   `startSession(templateDayId)`.
2. `startSession` insere em `workout_sessions` e copia os `template_exercises`
   para `session_exercises`.
3. A sessão carrega `session_exercises` e seus `session_sets`.
4. Cada série é gravada em `session_sets`, apontando para o `session_exercise`.
5. Finalizar preenche `completed_at`, `ended_at` e `duration_minutes`.

Todos os passos passam pela camada offline — uma sessão inteira pode ser
registrada sem nenhum sinal e sincronizada depois.

---

## Testes

108 testes no test runner nativo do Node, sem navegador e sem framework. O
IndexedDB é simulado com `fake-indexeddb`.

| Arquivo | Cobre |
| --- | --- |
| `offline-writes.test.js`, `write-errors.test.js` | escrita otimista, teto de rede, mensagens de erro |
| `offline-reads.test.js` | leitura em duas passadas |
| `offline-workout.e2e.test.js` | um treino inteiro registrado offline |
| `sw-offline.test.js`, `precache.test.js` | service worker e lista de precache |
| `session-timer.test.js`, `ios-timer.test.js`, `rest-alert.test.js` | descanso, restart e aviso |
| `auth-cache.test.js` | sessão de auth disponível offline |
| `quick-log.test.js` | parser do modo rápido |

A escolha de testar sem navegador é o que mantém a suíte rodando em ~18 segundos
no CI, a cada push e pull request.

---

## Limitações

- **Conflito é resolvido por última escrita.** O app é de uso pessoal e um treino
  acontece num aparelho só; isso basta. Não serve para edição simultânea em dois
  aparelhos.
- **O snapshot local cobre 60 dias** (`PULL_LOOKBACK_DAYS`). Histórico anterior
  exige rede.
- **Uma mutação é descartada após 5 tentativas.** Falha persistente perde o dado;
  não há hoje uma tela que mostre a fila ao usuário.
- **iOS não permite notificação de PWA em segundo plano** — daí o timer nativo.
