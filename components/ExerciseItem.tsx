"use client";

import { exerciseInitials, MUSCLE_LABELS, EQUIPMENT_LABELS } from "@/lib/utils";
import type { Exercise } from "@/lib/database.types";

interface Props {
  exercise: Exercise;
  isVariation?: boolean;
  rightSlot?: React.ReactNode;
  onClick?: () => void;
}

export function ExerciseItem({ exercise, isVariation, rightSlot, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1.5"
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        marginLeft: isVariation ? "20px" : 0,
        borderLeft: isVariation ? "2px solid var(--border-strong)" : "0.5px solid var(--border)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        className="rounded-lg flex items-center justify-center font-bold flex-shrink-0"
        style={{
          width: isVariation ? "32px" : "36px",
          height: isVariation ? "32px" : "36px",
          background: "rgba(152, 181, 210, 0.1)",
          color: "var(--primary)",
          fontSize: isVariation ? "11px" : "13px",
        }}
      >
        {isVariation ? "var" : exerciseInitials(exercise.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{exercise.name}</div>
        <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
          {MUSCLE_LABELS[exercise.primary_muscle] ?? exercise.primary_muscle}
          {exercise.equipment && ` · ${EQUIPMENT_LABELS[exercise.equipment] ?? exercise.equipment}`}
          {exercise.category === "composto" && " · composto"}
        </div>
      </div>
      {rightSlot}
    </div>
  );
}
