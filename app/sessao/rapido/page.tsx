"use client";

// Modo rápido — a tela que compete com o Notas do iPhone.
//
// Um textarea, um preview ao vivo e um botão. Sem prescrição, sem sugestão de
// carga, sem esperar leitura de banco: o catálogo vem do IndexedDB e todas as
// escritas são otimistas. Serve para o treino que fugiu da ficha e para anotar
// no vestiário o que já foi feito.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { offlineInsert } from "@/lib/offline-writes";
import { offlineReadList } from "@/lib/offline-reads";
import { db as offlineDB } from "@/lib/offline-db";
import { parseQuickLog, matchExercise, type ParsedExercise } from "@/lib/quick-log";
import { fmtKg } from "@/lib/utils";
import type { Exercise, WorkoutSession } from "@/lib/database.types";

const PLACEHOLDER = `Supino reto 80x8 80x7 75x8
Remada curvada 60x10x3
Barra fixa x12 x10
Rosca direta 12,5x12 @2`;

interface Resolved extends ParsedExercise {
  match: Exercise | null;
}

export default function ModoRapidoPage() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      // Catálogo do cache primeiro — é o que permite digitar de imediato.
      const local = offlineDB ? await offlineDB.exercises.toArray() : [];
      if (!alive) return;
      if (local.length > 0) setCatalog(local as Exercise[]);

      const open = offlineDB
        ? (await offlineDB.workout_sessions.filter((s) => s.completed_at == null).toArray())
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
        : null;
      if (alive && open) setActiveSession(open as WorkoutSession);

      if (local.length === 0) {
        const remote = await offlineReadList<Exercise>(
          () => supabase.from("exercises").select("*"),
          async () => (offlineDB ? ((await offlineDB.exercises.toArray()) as Exercise[]) : null)
        );
        if (alive) setCatalog(remote);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const parsed = useMemo(() => parseQuickLog(text), [text]);

  const resolved = useMemo<Resolved[]>(
    () => parsed.exercises.map((e) => ({ ...e, match: matchExercise(e.name, catalog) })),
    [parsed.exercises, catalog]
  );

  const totalSets = resolved.reduce((n, e) => n + e.sets.length, 0);
  const novos = resolved.filter((e) => !e.match).length;

  async function handleSave() {
    if (resolved.length === 0) {
      toast.error("Nada pra salvar ainda");
      return;
    }
    setSaving(true);

    try {
      const userId = getCurrentUserId();
      const now = new Date();

      // Com treino em andamento, anexa nele e deixa aberto. Sem treino, o
      // registro é um treino já concluído — é um log, não uma sessão ao vivo.
      let sessionId = activeSession?.id ?? null;
      if (!sessionId) {
        const session = await offlineInsert(
          "workout_sessions",
          {
            template_day_id: null,
            mesocycle_id: null,
            session_date: now.toLocaleDateString("en-CA"),
            started_at: now.toISOString(),
            ended_at: now.toISOString(),
            completed_at: now.toISOString(),
            custom_name: "Registro rápido",
            user_id: userId,
          },
          { localTable: "workout_sessions", optimistic: true }
        );
        sessionId = session.id;
      }

      const baseOrder = activeSession
        ? (offlineDB
            ? (await offlineDB.session_exercises.where("session_id").equals(sessionId).count())
            : 0)
        : 0;

      for (let i = 0; i < resolved.length; i++) {
        const item = resolved[i];

        // Nome que não está no catálogo entra como exercício customizado —
        // senão a série não teria onde ser pendurada.
        let exerciseId = item.match?.id;
        if (!exerciseId) {
          const created = await offlineInsert(
            "exercises",
            {
              name: item.name,
              // Não dá para adivinhar o grupo muscular de um nome digitado —
              // "outro" marca como "classificar depois" na biblioteca.
              primary_muscle: "outro",
              secondary_muscles: [],
              equipment: null,
              category: "composto",
              is_custom: true,
              parent_exercise_id: null,
              variation_label: null,
              user_id: userId,
            },
            { localTable: "exercises", optimistic: true }
          );
          exerciseId = created.id;
        }

        const sessionExercise = await offlineInsert(
          "session_exercises",
          {
            session_id: sessionId,
            exercise_id: exerciseId,
            template_exercise_id: null,
            exercise_order: baseOrder + i + 1,
            prescribed_sets: item.sets.length,
            rep_range_min: null,
            rep_range_max: null,
            target_rir: null,
            rest_seconds: null,
            is_completed: true,
          },
          { localTable: "session_exercises", optimistic: true }
        );

        for (let s = 0; s < item.sets.length; s++) {
          const set = item.sets[s];
          await offlineInsert(
            "session_sets",
            {
              session_id: sessionId,
              session_exercise_id: sessionExercise.id,
              exercise_id: exerciseId,
              set_number: s + 1,
              weight_kg: set.weight,
              reps: set.reps,
              rir: set.rir,
              is_warmup: false,
              is_failure: false,
              performed_at: now.toISOString(),
            },
            { localTable: "session_sets", optimistic: true }
          );
        }
      }

      toast.success(`${totalSets} ${totalSets === 1 ? "série" : "séries"} salvas`);
      router.push(activeSession ? `/sessao/ativa?id=${sessionId}` : `/sessao/resumo?id=${sessionId}`);
    } catch {
      setSaving(false);
      toast.error("Não deu pra salvar — o texto continua aqui");
    }
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Modo rápido" title="Anotar treino" />

      {/* Sem catálogo, TODO nome viraria exercício novo — e um exercício
          duplicado parte a progressão em duas, porque o histórico de e1RM é
          por exercise_id. Melhor avisar do que sujar a biblioteca em silêncio. */}
      {catalog.length === 0 && (
        <div
          className="mb-4 px-3 py-2.5 rounded-xl text-xs font-medium"
          style={{
            background: "rgba(251,191,36,0.08)",
            border: "0.5px solid rgba(251,191,36,0.3)",
            color: "#fbbf24",
            lineHeight: 1.6,
          }}
        >
          A biblioteca ainda não foi baixada neste aparelho, então nada vai casar com os exercícios que você já tem —
          tudo entraria como novo. Conecte uma vez antes de usar o modo rápido.
        </div>
      )}

      {activeSession && (
        <div
          className="mb-4 px-3 py-2.5 rounded-xl text-xs font-medium"
          style={{
            background: "rgba(68,147,224,0.08)",
            border: "0.5px solid rgba(68,147,224,0.3)",
            color: "var(--accent)",
          }}
        >
          Tem um treino em andamento — o que você escrever aqui entra nele.
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={9}
        autoFocus
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full rounded-xl px-3.5 py-3 resize-none"
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border-strong)",
          color: "var(--text)",
          outline: "none",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 15,
          lineHeight: 1.7,
        }}
      />

      <div className="text-xs mt-2 mb-4" style={{ color: "var(--faint)", lineHeight: 1.6 }}>
        <span className="font-bold">peso x reps</span>, separado por espaço. <span className="tabular">80x8x3</span> = 3
        séries iguais · <span className="tabular">@2</span> = RIR · <span className="tabular">x12</span> sem peso = peso
        corporal.
      </div>

      {/* Preview ao vivo — é o que dá confiança de que o texto virou o que você quis */}
      {resolved.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <Eyebrow>
              Preview · {resolved.length} {resolved.length === 1 ? "exercício" : "exercícios"} · {totalSets}{" "}
              {totalSets === 1 ? "série" : "séries"}
            </Eyebrow>
            {novos > 0 && <Pill variant="soft">{novos} novo{novos > 1 ? "s" : ""}</Pill>}
          </div>

          <div className="space-y-2 mb-4">
            {resolved.map((item, i) => (
              <Card key={i} className="!p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <div className="font-bold text-sm">{item.match?.name ?? item.name}</div>
                  {!item.match && (
                    <span
                      className="text-xs font-bold flex-shrink-0"
                      style={{
                        color: "#fbbf24",
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        background: "rgba(251,191,36,0.12)",
                        borderRadius: 4,
                      }}
                      title="Não está na biblioteca — será criado como exercício seu"
                    >
                      Novo
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {item.sets.map((s, j) => (
                    <span key={j} className="text-xs tabular" style={{ color: "var(--muted)" }}>
                      {j + 1}. {s.weight > 0 ? `${fmtKg(s.weight)}×${s.reps}` : `peso corporal ×${s.reps}`}
                      {s.rir != null ? <span style={{ color: "var(--faint)" }}> @{s.rir}</span> : null}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {parsed.unparsed.length > 0 && (
        <div
          className="mb-4 px-3 py-2.5 rounded-xl text-xs"
          style={{
            background: "rgba(239,68,68,0.07)",
            border: "0.5px solid rgba(239,68,68,0.28)",
            color: "#ff8888",
            lineHeight: 1.6,
          }}
        >
          <span className="font-bold">Não entendi</span> — e por isso não vou salvar:{" "}
          {parsed.unparsed.map((u) => `linha ${u.line} "${u.text}"`).join(", ")}
        </div>
      )}

      {/* Avisa mas não bloqueia: perder o treino é pior que um exercício duplicado,
          que dá pra arrumar depois na biblioteca. */}
      <Button onClick={handleSave} disabled={saving || resolved.length === 0} fullWidth>
        {saving
          ? "Salvando..."
          : activeSession
            ? "Adicionar ao treino →"
            : `Salvar ${totalSets > 0 ? `${totalSets} ` : ""}${totalSets === 1 ? "série" : "séries"} →`}
      </Button>

      <Link
        href="/sessao"
        className="block text-center text-xs font-bold mt-3 py-2"
        style={{ color: "var(--muted)", minHeight: "auto" }}
      >
        Voltar
      </Link>
    </div>
  );
}
