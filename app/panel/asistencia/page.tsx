import Link from "next/link";
import { obtenerContextoInstitucional } from "../../../lib/institucion-activa";
import type { NominaCursadaHibrida } from "../../../lib/hibrido/cola-indexeddb";
import { AsistenciaHibridaClient } from "./asistencia-hibrida-client";

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ institucion?: string }>;
}) {
  const { institucion } = await searchParams;
  const ctx = await obtenerContextoInstitucional(institucion, "asistencia");
  const fechaHoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const ciclo = Number(fechaHoy.slice(0, 4));

  const [materiasRes, cursadasRes, matriculasRes, personasRes] = await Promise.all([
    ctx.db.from("materias").select("id,codigo,nombre").eq("institucion_id", ctx.institucionId).order("nombre"),
    ctx.db.from("cursadas").select("id,matricula_id,materia_id,comision").eq("institucion_id", ctx.institucionId).eq("ciclo", ciclo),
    ctx.db.from("matriculas").select("id,persona_id").eq("institucion_id", ctx.institucionId).eq("estado", "ACTIVO"),
    ctx.db.from("personas").select("id,nombre,documento").eq("institucion_id", ctx.institucionId).eq("tipo", "estudiante"),
  ]);

  const materias = (materiasRes.data ?? []) as Array<{ id: string; codigo: string; nombre: string }>;
  const personasMap = new Map(((personasRes.data ?? []) as Array<{ id: string; nombre: string; documento: string }>).map((p) => [p.id, p]));
  const matriculasMap = new Map(((matriculasRes.data ?? []) as Array<{ id: string; persona_id: string }>).map((m) => [m.id, m.persona_id]));
  const materiasMap = new Map(materias.map((m) => [m.id, m.nombre]));

  const nominasPorMateria: Record<string, NominaCursadaHibrida[]> = {};
  for (const m of materias) nominasPorMateria[m.id] = [];

  for (const c of (cursadasRes.data ?? []) as Array<{ id: string; matricula_id: string; materia_id: string; comision: string }>) {
    const personaId = matriculasMap.get(c.matricula_id);
    if (!personaId) continue;
    const persona = personasMap.get(personaId);
    if (!persona) continue;
    (nominasPorMateria[c.materia_id] ??= []).push({
      cursada_id: c.id,
      estudiante_nombre: persona.nombre,
      estudiante_documento: persona.documento,
      materia_nombre: materiasMap.get(c.materia_id) ?? "",
      comision: c.comision,
    });
  }

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <p>
        <Link className="access" href={`/panel?institucion=${encodeURIComponent(ctx.institucionId)}`}>
          ← Volver al panel de {ctx.institucionNombre}
        </Link>
      </p>
      <header>
        <p className="eyebrow">Módulo Preceptoría Híbrida · Ciclo {ciclo}</p>
        <h2>Asistencia continua (Online / Offline-First)</h2>
        <p>
          Particionada para <strong>{ctx.institucionNombre}</strong>. Si cae la conexión, podés seguir tomando
          asistencia y sincronizar al reconectar con control idempotente y respeto al calendario institucional.
        </p>
      </header>
      <AsistenciaHibridaClient
        institucionId={ctx.institucionId}
        usuarioId={ctx.userId}
        materias={materias}
        nominasPorMateria={nominasPorMateria}
        ciclo={ciclo}
        fechaHoy={fechaHoy}
      />
    </section>
  );
}
