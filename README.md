# FitSec

[![CI](https://github.com/SecVergueiro/fitsec/actions/workflows/ci.yml/badge.svg)](https://github.com/SecVergueiro/fitsec/actions/workflows/ci.yml)

Registro de treino de musculação que **funciona sem internet**. PWA instalável,
pensado para ser usado no celular, dentro da academia, com sinal ruim e música
tocando em outro app.

**No ar:** [fitsec.vercel.app](https://fitsec.vercel.app)

## O problema

Um app de treino é usado num lugar hostil para software. O sinal de 4G da
academia é ruim ou inexistente. O celular fica bloqueado entre uma série e
outra. E o iOS **mata o PWA toda vez que você troca de app** — trocar de música
já é suficiente.

Isso inverte a premissa normal de uma aplicação web. O *cold start* deixa de ser
o caminho raro e passa a ser o mais percorrido, e cada `await` em uma requisição
de rede vira um spinner na frente de alguém que está com a barra na mão.

Três decisões de arquitetura saem disso, e são o que há de mais interessante no
projeto.

### 1. Leitura é cache-first, em duas passadas

Toda tela pinta primeiro do IndexedDB, em milissegundos, e só então a mesma
função roda contra o servidor — sem spinner, atualizando o que mudou.

Rede-primeiro na primeira pintura significaria segundos de tela vazia com sinal
ruim. A troca é aceitar mostrar dado de alguns segundos atrás em vez de não
mostrar nada.

### 2. O caminho crítico do treino não espera o servidor

Salvar série, adicionar exercício, finalizar treino: tudo grava local, devolve
na hora e sai pela fila de sincronização. O cronômetro de descanso começa antes
de qualquer `await`.

Se a escrita falhar, ela fica na fila e é reenviada — o usuário não perde a
série nem descobre o problema no meio do treino.

### 3. `navigator.onLine` mente

Essa é a parte que só aparece em uso real. No 4G ruim da academia o navegador
reporta `true` e o `fetch` fica pendurado até o timeout do sistema, que é longo
demais.

Por isso leitura e escrita têm teto próprio de **6 segundos**
(`NETWORK_TIMEOUT_MS`). Estourar o teto manda a operação para a fila, não para
uma tela de erro. Nenhuma tela chama `supabase.from(...)` diretamente — tudo
passa por `lib/offline-reads.ts` e `lib/offline-writes.ts`, senão o recurso
simplesmente não funciona sem sinal.

## O descanso no timer nativo do iPhone

Um PWA não alcança Live Activities — aquele card vivo na tela bloqueada e na
Dynamic Island é ActivityKit, API nativa que a web não acessa.

Mas o timer do app Relógio aparece exatamente ali, e o app Atalhos pode
iniciá-lo por URL scheme. Então o FitSec dispara `shortcuts://run-shortcut` no
começo do descanso, e **quem mostra a contagem na tela bloqueada é o próprio
iOS**.

O custo é um atalho criado uma vez no iPhone e uma piscada de cerca de um
segundo no app Atalhos. Por isso vem desligado por padrão: quem quer, liga no
Perfil.

## O que faz

- **Biblioteca de exercícios** — catálogo com seed inicial, busca, filtros por
  grupo muscular, variações e exercícios personalizados.
- **Templates de treino** — fichas com dias (Upper, Lower, Push…) e exercícios
  prescritos: séries, repetições, RIR e descanso. Inclui import pronto do UL+PPL.
- **Mesociclos** — blocos de periodização vinculados a um template, com semanas
  e deload.
- **Sessão ao vivo** — cronômetro, registro de série (peso, reps, RIR),
  timer de descanso com vibração, e1RM na hora, comparação com a sessão
  anterior, exercícios extras e supersets.
- **Modo rápido** — texto livre (`supino 80x8 80x7`) vira séries registradas.
  O parser é função pura e testada.
- **Estatísticas** — progressão de e1RM, volume por sessão, recordes pessoais e
  gráficos por exercício.
- **Reordenação por arraste** — templates e sessões, via `@dnd-kit`.
- **Multiusuário** — autenticação Supabase, cada conta com seus próprios dados.
- **Compartilhar sessão** — rota pública de leitura para mostrar um treino.

## Stack

| Camada | Escolha |
| --- | --- |
| Framework | Next.js 14 (App Router), quase todo client-side |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS, paleta dark, mobile-first (alvos de toque ≥ 44 px) |
| Banco remoto | Supabase (PostgreSQL + Auth) |
| Banco local | IndexedDB via [Dexie](https://dexie.org) |
| Gráficos | Recharts |
| Arraste | `@dnd-kit` |
| Testes | test runner nativo do Node + `fake-indexeddb` |

## Como rodar

Requer Node 20+.

```bash
npm install
cp .env.local.example .env.local   # preencha com as credenciais do Supabase
npm run dev                        # http://localhost:3000
```

`.env.local` precisa de:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Testar no celular, na mesma rede

```bash
npm run dev -- --hostname 0.0.0.0
```

Abra `http://SEU_IP:3000` no navegador do celular. Para testar o comportamento
offline de verdade é preciso o build de produção, porque o service worker só é
gerado no `npm run build`.

### Banco de dados

Execute os arquivos SQL **em ordem** no SQL Editor do Supabase:

| Arquivo | O que traz |
| --- | --- |
| `schema.sql` | Schema base e seed de exercícios |
| `migration_002.sql` | Variações, `is_custom`, tempo, notas por exercício |
| `migration_003.sql` | `session_exercises`, correções de schema e políticas de RLS |
| `migration_004.sql` | Autenticação e multiusuário |
| `migration_005.sql` | Supersets |
| `migration_006.sql` | `user_profiles` |
| `migration_007.sql` | Peso corporal no perfil |
| `migration_008.sql` | Nome personalizado em `workout_sessions` |

> O Supabase habilita RLS por padrão **sem nenhuma policy**, o que bloqueia todo
> `INSERT`/`UPDATE`/`DELETE`. Pular a `migration_003.sql` faz o app falhar com
> `new row violates row-level security policy` ao criar qualquer coisa.

### Outros comandos

```bash
npm test        # 108 testes: offline, fila de escrita, timers, parser
npm run build   # build de produção; gera public/sw.js no fim
```

O `npm run build` roda `scripts/gen-sw.mjs`, que monta o service worker a partir
de `scripts/sw-template.js` com a lista de precache do build atual. Isso precisa
existir porque o app é praticamente todo client-side: sem os chunks de
`/_next/static` no Cache API, a página cacheada abriria em branco offline.

## Como está organizado

```
app/
  page.tsx                    home com calendário e treino do dia
  login/                      autenticação
  biblioteca/                 CRUD de exercícios
  treinos/                    templates, dias prescritos e mesociclos
  sessao/                     sessão ativa, modo rápido e resumo
  stats/                      progressão, recordes e gráficos
  public/sessao/[id]/         visualização pública de uma sessão
lib/
  offline-db.ts               espelho IndexedDB + fila de mutações (Dexie)
  offline-reads.ts            leitura cache-first em duas passadas
  offline-writes.ts           escrita otimista com teto de rede e fila
  sync-engine.ts              pull do snapshot, enfileiramento e flush
  ios-timer.ts                descanso no timer nativo do iPhone
  session-timer.ts            descanso e treino em andamento no localStorage
  quick-log.ts                parser do modo rápido (função pura)
  auth-cache.ts               sessão de auth disponível offline
scripts/
  gen-sw.mjs                  gera public/sw.js com o precache do build
  sw-template.js              template do service worker
tests/                        108 testes, sem navegador
```

Detalhes de arquitetura — o que é espelhado localmente, como a fila resolve
conflito e o fluxo completo de uma sessão — estão em
**[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

## Testes

108 testes rodando no test runner nativo do Node, sem navegador e sem framework
de teste. O IndexedDB é simulado com `fake-indexeddb`.

Cobrem justamente o que é difícil de verificar na mão: o que acontece quando a
rede cai no meio de uma escrita, se a fila reenvia sem duplicar, se o descanso
sobrevive ao restart do PWA, e se o parser do modo rápido entende o que o
usuário digitou.

O CI roda build e testes a cada push e em cada pull request.

## Limitações conhecidas

- **iOS não permite notificação de PWA em segundo plano.** O aviso de fim de
  descanso depende do app estar aberto, ou do timer nativo (seção acima).
- **O timer nativo exige configuração manual** — um atalho criado no iPhone com
  nome exato. Não há como automatizar isso a partir da web.
- **A fila de sincronização resolve conflito por última escrita.** Como o app é
  de uso pessoal e um treino acontece num aparelho só, isso basta; não serve
  para edição simultânea em dois aparelhos.
- **O snapshot local cobre 60 dias.** Histórico mais antigo exige rede.
- **Sem exportação de dados.** Backup hoje é via SQL no Supabase.

## Licença

Projeto pessoal, sem licença definida.
