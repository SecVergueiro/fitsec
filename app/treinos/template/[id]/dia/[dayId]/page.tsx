"use client";

// Redirecionador da URL antiga (/treinos/template/<id>/dia/<dayId>)
// para /treinos/dia?id=<dayId>&template=<id>.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/Button";

export default function DiaLegacyRedirect() {
  const params = useParams();
  const router = useRouter();
  const templateId = params?.id as string | undefined;
  const dayId = params?.dayId as string | undefined;

  useEffect(() => {
    if (dayId) router.replace(`/treinos/dia?id=${dayId}&template=${templateId ?? ""}`);
    else router.replace(templateId ? `/treinos/template?id=${templateId}` : "/treinos");
  }, [dayId, templateId, router]);

  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}
