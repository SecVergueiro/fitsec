"use client";

// Redirecionador das URLs antigas (/sessao/<id>) para a rota estática
// /sessao/ativa?id=<id>. Mantido só para links e histórico do navegador —
// a rota dinâmica não existe offline, então nada deve apontar mais pra cá.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/Button";

export default function SessaoLegacyRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  useEffect(() => {
    router.replace(id ? `/sessao/ativa?id=${id}` : "/sessao");
  }, [id, router]);

  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}
