# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack
- Next.js 14 App Router + TypeScript — todas as páginas são `"use client"` (sem SSR nem API Routes)
- Tailwind com paleta dark (--text: #edeeef, --background: #040607, --primary: #98b5d2, --accent: #4493e0)
- Inter como fonte
- Supabase single-user (sem auth) — todas as queries usam role `anon` via chave pública
- Mobile-first (max-w-md, touch targets >= 44px)

## Convenções
- Componentes UI em components/ui.tsx (Card, Pill, Eyebrow, PageHeader)
- Botões em components/Button.tsx
- Helpers de formatação em lib/utils.ts
- Tipos do banco em lib/database.types.ts
- Páginas usam "use client" (sem SSR)
- Numero tabular em colunas de peso/reps usa classe "tabular"

## Comandos
- `npm run dev` — rodar localmente (localhost:3000)
- `npm run build` — validar build de produção
- `npm run lint` — ESLint

Não há testes automatizados no projeto.

## Configuração de ambiente

Renomeie `.env.local.example` → `.env.local` e preencha com as credenciais do Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Banco de dados — migrations

Execute os arquivos SQL **em ordem** no SQL Editor do Supabase:

1. `schema.sql` — schema base + seed de ~38 exercícios
2. `migration_002.sql` — variações de exercício, `is_custom`, `tempo`, `session_exercise_notes`
3. `migration_003.sql` — tabela `session_exercises`, colunas `completed_at`/`session_exercise_id`, **RLS policies permissivas para todas as tabelas**

> **Importante**: o Supabase habilita RLS por padrão sem nenhuma policy, o que bloqueia **todo INSERT/UPDATE/DELETE** via chave anon. Sem rodar `migration_003.sql` o app lança `new row violates row-level security policy` ao tentar criar template, sessão, etc.

### Tabelas principais

| Tabela | Papel |
|--------|-------|
| `exercises` | Biblioteca global (seed + customizados pelo usuário) |
| `templates` | Fichas de treino (UL+PPL, ABC…) |
| `template_days` | Dias dentro de um template (Upper, Lower, Push…) |
| `template_exercises` | Exercícios prescritos por dia (séries, reps, RIR, descanso) |
| `mesocycles` | Blocos de periodização vinculados a um template |
| `workout_sessions` | Sessões executadas; `completed_at IS NULL` = sessão em andamento |
| `session_exercises` | Cópia dos `template_exercises` ao iniciar a sessão; rastreia `is_completed` |
| `session_sets` | Cada série registrada (peso, reps, RIR); é a tabela mais importante |

Views: `set_estimated_1rm` (Epley), `personal_records`, `weekly_volume`.

## Fluxo de uma sessão

1. `sessao/page.tsx` detecta o dia do template ativo pelo `weekday` e chama `startSession(templateDayId)`
2. `startSession` insere em `workout_sessions` e copia os `template_exercises` para `session_exercises`
3. `sessao/[id]/page.tsx` carrega `session_exercises` + `session_sets` por `session_exercise_id`
4. Cada série salva em `session_sets` com `session_exercise_id` apontando para o `session_exercises`
5. Finalizar: preenche `completed_at`, `ended_at` e `duration_minutes` em `workout_sessions`

## Estrutura de diretórios relevante

```
app/
  biblioteca/          # CRUD de exercícios
  treinos/
    novo/              # criar template ou importar preset UL+PPL
    template/[id]/     # detalhe do template (dias)
    template/[id]/dia/[dayId]/  # exercícios prescritos de um dia
    mesociclo/         # histórico + criar mesociclo
  sessao/              # tela principal de treino (página raiz + sessão ativa)
  stats/               # progressão e PRs (visão geral + detalhe por exercício)

lib/
  supabase.ts          # cliente singleton
  database.types.ts    # interfaces TypeScript das tabelas
  utils.ts             # estimate1RM, fmtKg, MUSCLE_LABELS, WEEKDAY_LABELS…
components/
  ui.tsx               # Card, Pill, Eyebrow, PageHeader
  Button.tsx           # Button, Input, Spinner
```

---

## O que já está pronto e funcional
O que já está pronto e funcional — Core do app (90% do uso diário):

Schema completo de banco com 8 tabelas + views
Biblioteca de exercícios com busca, filtros e variações
Templates de treino com dias e exercícios prescritos
Mesociclos com periodização (fases + deload)
Sessão ao vivo completa: cronômetro, registro de séries, timer de descanso com vibração, e1RM, sessão anterior, exercícios extras
Stats com gráficos de progressão (e1RM, volume, histórico)
Home com calendário e treino do dia
Import pré-pronto do UL+PPL
PWA instalável no celular

Isso já é mais funcional que muito SaaS pago de R$ 30/mês. Você consegue usar hoje, sem problema.
⚠️ Bugs/limitações que provavelmente vão aparecer no uso
Coisas que eu sei que podem incomodar mas não bloqueiam o uso:

Sem reordenação de exercícios — se você quiser trocar a ordem de um exercício no template ou na sessão, hoje só conseguiria deletar e recriar. Falta drag-and-drop ou setas pra cima/baixo.
Não dá pra editar uma série já salva — se errar o peso/reps depois de salvar, só consegue deletar e recriar. Edição inline seria útil.
Não há "duplicar template" — se quiser criar uma variação do UL+PPL, tem que montar do zero.
Sem export de dados — todos os teus dados estão presos no Supabase. Backup manual seria via SQL.
Tela em branco quando não há mesociclo nem template — primeiro uso pode ficar confuso. Falta um "onboarding" guiado.
Stats não tem filtro temporal — vê tudo desde o início, não tem "últimos 30 dias", "este mesociclo", etc.
Não há comparação entre mesociclos — pra recomposição é importante ver "como evolui no Bloco 1 vs Bloco 2".

❌ O que ainda falta de funcionalidade
Coisas que mencionei e não entreguei:

Proteção por senha — eu prometi um middleware com senha pra evitar que qualquer um acesse a URL. Não entreguei. Hoje teu app está aberto pra quem descobrir a URL.
Sessão de exercício livre dentro da Sessão — eu adiciono exercício extra mas com prescrição padrão (3×8-12). Editar a prescrição na hora não dá.
Notas durante a sessão — a coluna session_exercise_notes existe no banco (migration_002), mas a UI pra registrar isso não existe. Útil pra anotar "ombro travando hoje".
Edição de mesociclo — só dá pra criar e encerrar. Não dá pra ajustar nome, semanas ou deload depois.
Marcar série como "falha" — campo is_failure existe no banco, mas não aparece no form. Útil pra identificar últimas séries onde foi até a falha.
Tempo (cadência) — campo tempo existe (3-1-1-0), mas não tem UI.
Bodyweight tracking — campo bodyweight_kg existe na sessão, sem UI pra preencher. Útil pra recomposição.
Energia/notas da sessão — campos energy_level e notes existem, sem UI.

🎨 Polimento de UX
Coisas que não são "bugs" mas melhorariam muito:

Toasts/notificações — quando salva uma série, não tem feedback visual além da série aparecer. Um toast "Série salva" confirmaria.
Animações de transição — entre telas é meio seco.
Skeleton loaders — hoje aparece spinner ou nada. Skeletons dariam mais polish.
Dark mode toggle — hoje é só dark, mas alguma noite você pode querer mais escuro/claro.
Atalho "duplicar última sessão" — pra dias de "treino livre" que só replica o que fez ontem.
Confirmação visual ao bater PR — quando você bate um e1RM novo, deveria ter um destaque tipo "🏆 NOVO PR".
Heatmap anual — tipo o GitHub contribution graph, mas de treinos.

🔒 Coisas técnicas/segurança

Senha no app (já mencionei).
Row Level Security — está habilitado com policies permissivas para `anon` (migration_003). Se no futuro quiser múltiplos usuários, precisa migrar para auth e trocar as policies.
Rate limiting — não tem nenhum. Se alguém descobrir a URL pode hammer no banco.
Backup automático — Supabase free não faz backup. Pra dados de anos de treino, vale exportar periodicamente.
Sem testes automatizados — zero. Mudanças futuras podem quebrar coisas sem você perceber.

📊 Visualizações ausentes

Gráfico de força relativa — comparar evolução de exercícios diferentes na mesma escala (% de 1RM).
Distribuição de volume por grupo muscular — pizza chart "esta semana você fez 30% peito, 25% costas, etc."
Frequência de treino — "treinou 4.2 dias/semana em média nos últimos 3 meses".
Calendário mensal/anual — hoje só tem semanal.

