"use client";

import { useEffect } from "react";
import { useToast } from "./Toast";
import { describeWriteError } from "@/lib/offline-writes";

/**
 * Toast para escritas que o servidor recusou de vez.
 *
 * Falha de rede não passa por aqui — vai pra fila e o OfflineBadge mostra o
 * pendente. Só chega aqui recusa definitiva (constraint, coluna inválida),
 * onde a fila não adianta e o usuário precisa saber que não salvou.
 *
 * Escuta `unhandledrejection` em vez de exigir try/catch nas ~40 chamadas de
 * escrita: quem já trata o erro (biblioteca, criar template) mostra a própria
 * mensagem e a rejeição nunca fica sem handler, então não duplica o toast.
 */
export function WriteErrorToast() {
  const toast = useToast();

  useEffect(() => {
    function onRejection(event: PromiseRejectionEvent) {
      const reason: any = event.reason;
      if (reason?.name !== "ServerRejectedError") return;

      // Silencia o "Unhandled rejection" do console, mas mantém o detalhe
      // técnico logado — a mensagem do PostgREST é inútil pro usuário final.
      event.preventDefault();
      console.error("[fitsec] escrita recusada:", reason.table, reason.op, reason.cause);

      toast.error(describeWriteError(reason));
    }

    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, [toast]);

  return null;
}
