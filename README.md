# FitSec

Sistema pessoal de tracking de treinos. Single-user, sem assinatura, sem anúncios.

Stack: Next.js 14 + TypeScript + Tailwind + Supabase + Recharts.

---

## ⚠️ Antes de rodar — atualize o banco

Rode no SQL Editor do Supabase, **na ordem**:

1. `schema.sql` (já rodado por você antes)
2. `migration_002.sql` (variações de exercício)
3. **`migration_003.sql`** ← novo, obrigatório pra essa entrega

Sem o migration 003, a tela de Sessão não vai funcionar.

---

## Setup

### 1. Variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Edite `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 2. Rodar localmente

```bash
npm install
npm run dev
```

### 3. Testar no celular (mesma rede WiFi)

```bash
npm run dev -- --hostname 0.0.0.0
```

Acesse `http://SEU_IP:3000` no navegador do celular.

### 4. Deploy no Vercel

Sobe pro GitHub, conecta no Vercel, adiciona as env vars no dashboard.

---

## Como usar — fluxo completo

### Primeiro uso (5 minutos):

1. **Treinos → "+ Novo"** → clica em **"UL+PPL Recomposição → Importar pronto"**
   - Já vai criar o template completo com os 5 dias e todos os exercícios prescritos
2. **Treinos → "+ Iniciar mesociclo"** → preenche nome, semanas (8), deload (8), salva
3. Volta na **Home** — vai mostrar o "Treino de hoje" baseado no dia da semana

### Durante o treino:

1. Toca em **"Iniciar sessão"** na Home (ou aba **Sessão**)
2. Cada exercício mostra: prescrição, sessão anterior, e1RM atual
3. Pra cada série: digita peso, reps, RIR (opcional) → toca em **"Salvar série"**
4. Timer de descanso inicia automático (vibra quando acaba)
5. Marca o exercício como completo (✓) e passa pro próximo
6. Pode adicionar exercício extra a qualquer momento
7. Toca **"Finalizar"** quando acabar

### Acompanhar progressão:

- Aba **Stats**: lista de exercícios ordenada por melhor PR
- Toca num exercício pra ver gráfico de e1RM, volume por sessão e histórico

---

## Estrutura

```
fitsec/
├── app/
│   ├── page.tsx                              # Home
│   ├── biblioteca/page.tsx                   # Lista exercícios
│   ├── treinos/
│   │   ├── page.tsx                          # Lista templates + meso
│   │   ├── novo/page.tsx                     # Criar template (com import UL+PPL)
│   │   ├── template/[id]/
│   │   │   ├── page.tsx                      # Detalhe do template
│   │   │   └── dia/[dayId]/page.tsx          # Editar dia
│   │   └── mesociclo/
│   │       ├── page.tsx                      # Mesociclo ativo
│   │       └── novo/page.tsx                 # Iniciar bloco
│   ├── sessao/
│   │   ├── page.tsx                          # Index (continuar / iniciar)
│   │   └── [id]/page.tsx                     # Sessão ao vivo
│   └── stats/
│       ├── page.tsx                          # Lista por exercício
│       └── [exerciseId]/page.tsx             # Detalhe + gráficos
├── components/
│   ├── BottomNav.tsx
│   ├── ExerciseItem.tsx
│   ├── ui.tsx                                # Card, Pill, Eyebrow
│   └── Button.tsx                            # Button, Input, Spinner
├── lib/
│   ├── supabase.ts
│   ├── database.types.ts
│   └── utils.ts                              # Helpers (1RM, formatação, labels)
├── schema.sql
├── migration_002.sql
└── migration_003.sql
```

---

## Atalhos úteis

- **Home** mostra o treino do dia automaticamente baseado no `weekday` configurado no template
- **Sessão** detecta sessão em andamento e oferece continuar
- **Aquecimento**: marque a checkbox na hora de salvar a série — não conta nas estatísticas
- **e1RM**: estimativa de 1RM via fórmula de Epley (`peso × (1 + reps/30)`)
- O cronômetro de descanso vibra o celular quando termina (se permitido)
- **PWA**: depois de abrir no celular, "Adicionar à tela inicial" instala como app standalone
