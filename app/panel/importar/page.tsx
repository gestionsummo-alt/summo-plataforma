import Link from "next/link";
import { obtenerContextoInstitucional } from "../../../lib/institucion-activa";
import { ImportadorWizard } from "./importador-wizard";

export default async function ImportarPage({
  searchParams,
}: {
  searchParams: Promise<{ institucion?: string }>;
}) {
  const { institucion } = await searchParams;
  const ctx = await obtenerContextoInstitucional(institucion, "secretaria");

  const planesRes = await ctx.db
    .from("planes")
    .select("id,carrera,codigo")
    .eq("institucion_id", ctx.institucionId)
    .order("carrera");

  const planes = (planesRes.data ?? []) as Array<{ id: string; carrera: string; codigo: string }>;
  const iaDisponible = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <p style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="access" href={`/panel?institucion=${encodeURIComponent(ctx.institucionId)}`}>
          ← Volver al panel de {ctx.institucionNombre}
        </Link>
        <Link className="access" href={`/panel/secretaria?institucion=${encodeURIComponent(ctx.institucionId)}`}>
          Ir a Secretaría →
        </Link>
      </p>
      <header>
        <p className="eyebrow">Asistente de Ingesta Documental</p>
        <h2>Carga inteligente de documentos (PDF, Excel y Word)</h2>
        <p>
          Institución: <strong>{ctx.institucionNombre}</strong> · Rol: <strong>{ctx.rol}</strong>.
          Extraé datos reales de diseños curriculares, resoluciones y planillas con revisión humana obligatoria antes de impactar la base.
        </p>
      </header>
      <ImportadorWizard
        institucionId={ctx.institucionId}
        planesExistentes={planes}
        iaDisponible={iaDisponible}
      />
    </section>
  );
}
