import Link from "next/link";
import { obtenerContextoInstitucional } from "../../../lib/institucion-activa";
import { FormulariosSecretaria } from "./secretaria-forms";

export default async function SecretariaPage({
  searchParams,
}: {
  searchParams: Promise<{ institucion?: string }>;
}) {
  const { institucion } = await searchParams;
  const ctx = await obtenerContextoInstitucional(institucion, "secretaria");

  const [planesRes, materiasRes, personasRes, matriculasRes, cursadasRes, auditRes] = await Promise.all([
    ctx.db.from("planes").select("id,carrera,codigo,cohorte_desde").eq("institucion_id", ctx.institucionId).order("carrera"),
    ctx.db.from("materias").select("id,plan_id,codigo,nombre").eq("institucion_id", ctx.institucionId).order("nombre"),
    ctx.db.from("personas").select("id,documento,nombre").eq("institucion_id", ctx.institucionId).eq("tipo", "estudiante").order("nombre"),
    ctx.db.from("matriculas").select("id,persona_id,plan_id,cohorte,estado").eq("institucion_id", ctx.institucionId),
    ctx.db.from("cursadas").select("id,matricula_id,materia_id,ciclo,comision").eq("institucion_id", ctx.institucionId).order("ciclo", { ascending: false }).limit(50),
    ctx.db.from("auditoria_eventos").select("id,modulo,accion,origen_sync,creado_en").eq("institucion_id", ctx.institucionId).order("creado_en", { ascending: false }).limit(15),
  ]);

  const planes = (planesRes.data ?? []) as Array<{ id: string; carrera: string; codigo: string; cohorte_desde: number }>;
  const materias = (materiasRes.data ?? []) as Array<{ id: string; plan_id: string; codigo: string; nombre: string }>;
  const personas = new Map(((personasRes.data ?? []) as Array<{ id: string; documento: string; nombre: string }>).map((p) => [p.id, p]));
  const matriculas = ((matriculasRes.data ?? []) as Array<{ id: string; persona_id: string; plan_id: string; cohorte: number; estado: string }>).map((m) => ({
    id: m.id,
    persona_nombre: personas.get(m.persona_id)?.nombre ?? "Estudiante",
    persona_doc: personas.get(m.persona_id)?.documento ?? "—",
    cohorte: m.cohorte,
    estado: m.estado,
  }));
  const activosUnicos = new Set((matriculasRes.data ?? []).filter((m) => m.estado === "ACTIVO").map((m) => m.persona_id)).size;

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <p>
        <Link className="access" href={`/panel?institucion=${encodeURIComponent(ctx.institucionId)}`}>
          ← Volver al panel de {ctx.institucionNombre}
        </Link>
      </p>
      <header>
        <p className="eyebrow">Módulo Secretaría Académica</p>
        <h2>Planes, matrículas y cursadas</h2>
        <p>
          Cupo utilizado: <strong>{activosUnicos}</strong> / <strong>{ctx.licencia?.max_estudiantes ?? 0}</strong> estudiantes activos.
        </p>
      </header>

      <FormulariosSecretaria
        institucionId={ctx.institucionId}
        planes={planes}
        materias={materias}
        matriculas={matriculas}
      />

      <div className="grid">
        <article>
          <h3>Cursadas activas ({(cursadasRes.data ?? []).length})</h3>
          <ul>
            {(cursadasRes.data ?? []).map((c) => {
              const mat = matriculas.find((m) => m.id === c.matricula_id);
              const subj = materias.find((s) => s.id === c.materia_id);
              return (
                <li key={c.id}>
                  {mat?.persona_nombre ?? "—"} · <strong>{subj?.nombre ?? "—"}</strong> · Ciclo {c.ciclo} (Com. {c.comision})
                </li>
              );
            })}
          </ul>
        </article>
        <article>
          <h3>Auditoría reciente</h3>
          <ul>
            {(auditRes.data ?? []).map((a) => (
              <li key={a.id}>
                <strong>{a.accion}</strong> ({a.modulo} · {a.origen_sync}) —{" "}
                {new Date(a.creado_en).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
