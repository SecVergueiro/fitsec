"use client";

// Redirecionador das URLs antigas (/sessao/<id>/resumo) para /sessao/resumo?id=<id>.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/Button";

export default function ResumoLegacyRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  useEffect(() => {
    router.replace(id ? `/sessao/resumo?id=${id}` : "/historico");
  }, [id, router]);

  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}
