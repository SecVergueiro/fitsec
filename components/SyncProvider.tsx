"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { attachSyncListeners, pullSnapshot, flushQueue } from "@/lib/sync-engine";
import { requestPersistentStorage } from "@/lib/offline-db";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // 1. Pede armazenamento persistente (importante no iOS)
    requestPersistentStorage();

    // 2. Anexa listeners para flush automático ao reconectar
    const detach = attachSyncListeners();

    // 3. Baixa snapshot inicial em background (não bloqueia render)
    if (typeof navigator !== "undefined" && navigator.onLine) {
      pullSnapshot(user.id).then(() => {
        flushQueue();
      });
    } else {
      flushQueue();
    }

    return detach;
  }, [user]);

  return <>{children}</>;
}
