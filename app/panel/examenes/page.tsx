import Link from "next/link";
import { obtenerContextoInstitucional } from "../../../lib/institucion-activa";
import type { ResultadoActaItem } from "../../../lib/hibrido/fusion-acta";
import { EditorActaExamen, FormulariosMesas } from "./examenes-forms";

export default async function ExamenesPage({
  searchParams,
}: {
  searchParams: Promise<{ institucion?: string }>;
}) {
  const { institucion } = await searchParams;
  const ctx = await obtenerContextoInstitucional(institucion, "examenes");

  const [materiasRes, mesasRes, matriculasRes, personasRes, insExamRes, reglasRes, actasRes] = await Promise.all([
    ctx.db.from("materias").select("id,plan_id,codigo,nombre").eq("institucion_id", ctx.institucionId).order("nombre"),
    ctx.db.from("mesas").select("id,materia_id,fecha,cierre,llamado").eq("institucion_id", ctx.institucionId).order("fecha"),
    ctx.db.from("matriculas").select("id,persona_id,estado").eq("institucion_id", ctx.institucionId).eq("estado", "ACTIVO"),
    ctx.db.from("personas").select("id,nombre,documento").eq("institucion_id", ctx.institucionId).eq("tipo", "estudiante"),
    ctx.db.from("inscripciones_examen").select("id,mesa_id,matricula_id").eq("institucion_id", ctx.institucionId),
    ctx.db.from("reglas").select("id,plan_id,aprobacion,escala_min,escala_max,version").eq("institucion_id", ctx.institucionId).order("version", { ascending: false }),
    ctx.db.from("actas").select("id,mesa_id,version,tipo,referencia").eq("institucion_id", ctx.institucionId).order("version", { ascending: false }),
  ]);

  const materias = (materiasRes.data ?? []) as Array<{ id: string; plan_id: string; codigo: string; nombre: string }>;
  const personasMap = new Map(((personasRes.data ?? []) as Array<{ id: string; nombre: string; documento: string }>).map((p) => [p.id, p]));
  const matriculas = ((matriculasRes.data ?? []) as Array<{ id: string; persona_id: string }>).map((m) => ({
    id: m.id,
    persona_nombre: personasMap.get(m.persona_id)?.nombre ?? "Estudiante",
    persona_doc: personasMap.get(m.persona_id)?.documento ?? "—",
  }));
  const matriculasMap = new Map(matriculas.map((m) => [m.id, m]));
  const materiasMap = new Map(materias.map((m) => [m.id, m]));

  const actas = (actasRes.data ?? []) as Array<{ id: string; mesa_id: string; version: number; tipo: "VOLANTE" | "DEFINITIVA"; referencia: string }>;
  const actaIds = actas.map((a) => a.id);
  const resultadosRes = actaIds.length
    ? await ctx.db
        .from("resultados")
        .select("acta_id,inscripcion_id,nota,condicion")
        .eq("institucion_id", ctx.institucionId)
        .in("acta_id", actaIds)
    : { data: [] };

  const resultadosPorActa = new Map<string, ResultadoActaItem[]>();
  for (const r of (resultadosRes.data ?? []) as Array<{ acta_id: string; inscripcion_id: string; nota: number | null; condicion: "APROBADO" | "DESAPROBADO" | "AUSENTE" }>) {
    const arr = resultadosPorActa.get(r.acta_id) ?? [];
    arr.push({ inscripcion_id: r.inscripcion_id, nota: r.nota, condicion: r.condicion });
    resultadosPorActa.set(r.acta_id, arr);
  }

  const mesasRaw = (mesasRes.data ?? []) as Array<{ id: string; materia_id: string; fecha: string; cierre: string; llamado: number }>;
  const mesasForm = mesasRaw.map((m) => ({
    id: m.id,
    materia_nombre: materiasMap.get(m.materia_id)?.nombre ?? "Materia",
    fecha: m.fecha,
    llamado: m.llamado,
  }));

  const reglas = (reglasRes.data ?? []) as Array<{ id: string; plan_id: string; aprobacion: number; escala_min: number; escala_max: number }>;

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <p>
        <Link className="access" href={`/panel?institucion=${encodeURIComponent(ctx.institucionId)}`}>
          ← Volver al panel de {ctx.institucionNombre}
        </Link>
      </p>
      <header>
        <p className="eyebrow">Módulo Mesas y Actas Digitales</p>
        <h2>Llamados, inscripción con correlativas y actas Volante → Definitiva</h2>
        <p>
          Institución: <strong>{ctx.institucionNombre}</strong> · Rol: <strong>{ctx.rol}</strong>
        </p>
      </header>

      <FormulariosMesas
        institucionId={ctx.institucionId}
        materias={materias}
        mesas={mesasForm}
        matriculas={matriculas}
      />

      <h3>Actas de mesas habilitadas ({mesasRaw.length})</h3>
      <div style={{ display: "grid", gap: 16 }}>
        {mesasRaw.map((m) => {
          const mat = materiasMap.get(m.materia_id);
          const regla = mat ? reglas.find((r) => r.plan_id === mat.plan_id) ?? null : null;
          const actasMesa = actas.filter((a) => a.mesa_id === m.id);
          const def = actasMesa.find((a) => a.tipo === "DEFINITIVA") ?? null;
          const vol = actasMesa.find((a) => a.tipo === "VOLANTE") ?? null;
          const actaActiva = def ?? vol;
          const inscriptos = ((insExamRes.data ?? []) as Array<{ id: string; mesa_id: string; matricula_id: string }>)
            .filter((i) => i.mesa_id === m.id)
            .map((i) => {
              const stu = matriculasMap.get(i.matricula_id);
              return {
                inscripcion_id: i.id,
                estudiante_nombre: stu?.persona_nombre ?? "Estudiante",
                estudiante_doc: stu?.persona_doc ?? "—",
              };
            });

          return (
            <EditorActaExamen
              key={m.id}
              institucionId={ctx.institucionId}
              mesaId={m.id}
              materiaNombre={`${mat?.nombre ?? "Materia"} · ${m.llamado}º llamado (${new Date(m.fecha).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })})`}
              regla={regla}
              inscriptos={inscriptos}
              resultadosIniciales={actaActiva ? resultadosPorActa.get(actaActiva.id) ?? [] : []}
              actaDefinitiva={def ? { version: def.version, referencia: def.referencia } : null}
              tieneVolante={Boolean(vol)}
            />
          );
        })}
      </div>
    </section>
  );
}
