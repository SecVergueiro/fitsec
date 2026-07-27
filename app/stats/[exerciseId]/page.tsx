"use client";

// Redirecionador da URL antiga (/stats/<exerciseId>) para /stats/exercicio?id=<id>.
// A rota dinâmica não existe offline; nada no app aponta mais pra cá.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/Button";

export default function StatsLegacyRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.exerciseId as string | undefined;

  useEffect(() => {
    router.replace(id ? `/stats/exercicio?id=${id}` : "/stats");
  }, [id, router]);

  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}
