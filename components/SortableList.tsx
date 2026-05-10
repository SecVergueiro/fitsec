"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";

interface SortableListProps<T extends { id: string }> {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  children: (item: T, dragHandleProps: DragHandleProps) => ReactNode;
}

export interface DragHandleProps {
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
}

/**
 * Lista vertical sortable com touch/drag.
 * Usa um "drag handle" exposto para o consumer aplicar onde quiser.
 *
 * Uso:
 *   <SortableList items={exs} onReorder={ids => ...}>
 *     {(ex, handle) => (
 *       <Card>
 *         <DragHandle {...handle} />
 *         <span>{ex.name}</span>
 *       </Card>
 *     )}
 *   </SortableList>
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    onReorder(reordered.map((r) => r.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} id={item.id}>
            {(handle) => children(item, handle)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: DragHandleProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 50 : "auto",
    position: "relative",
    boxShadow: isDragging ? "0 12px 30px rgba(0,0,0,0.55)" : "none",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes: attributes as any, listeners: listeners as any, isDragging })}
    </div>
  );
}

/**
 * Ícone padrão de "drag handle" (6 pontinhos). Aplique os handle props nele.
 */
export function DragHandle({ attributes, listeners, isDragging }: DragHandleProps) {
  return (
    <button
      type="button"
      aria-label="Mover"
      {...attributes}
      {...listeners}
      className="rounded-md flex items-center justify-center flex-shrink-0"
      style={{
        width: 32,
        height: 44,
        minHeight: 44,
        cursor: isDragging ? "grabbing" : "grab",
        background: isDragging ? "var(--surface-strong)" : "transparent",
        color: isDragging ? "var(--primary)" : "var(--faint)",
        border: "none",
        touchAction: "none",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.5" />
        <circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" />
        <circle cx="15" cy="18" r="1.5" />
      </svg>
    </button>
  );
}
