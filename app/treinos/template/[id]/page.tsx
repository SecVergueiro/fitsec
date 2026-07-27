"use client";

// Redirecionador da URL antiga (/treinos/template/<id>) para /treinos/template?id=<id>.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/Button";

export default function TemplateLegacyRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  useEffect(() => {
    router.replace(id ? `/treinos/template?id=${id}` : "/treinos");
  }, [id, router]);

  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}
