import Link from "next/link";
import { obtenerContextoInstitucional } from "../../../lib/institucion-activa";
import { FormulariosPlanificaciones } from "./planificaciones-forms";

export default async function PlanificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ institucion?: string }>;
}) {
  const { institucion } = await searchParams;
  const ctx = await obtenerContextoInstitucional(institucion, "planificaciones");

  const [materiasRes, docentesRes, planifRes] = await Promise.all([
    ctx.db.from("materias").select("id,codigo,nombre").eq("institucion_id", ctx.institucionId).order("nombre"),
    ctx.db.from("personas").select("id,documento,nombre").eq("institucion_id", ctx.institucionId).eq("tipo", "docente").order("nombre"),
    ctx.db.from("planificaciones").select("id,materia_id,docente_id,version,contenido,estado").eq("institucion_id", ctx.institucionId).order("version", { ascending: false }),
  ]);

  const materias = (materiasRes.data ?? []) as Array<{ id: string; codigo: string; nombre: string }>;
  const docentes = (docentesRes.data ?? []) as Array<{ id: string; documento: string; nombre: string }>;
  const planifs = planifRes.data ?? [];
  const puedeAprobar = ["direccion", "secretaria"].includes(ctx.rol);

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <p>
        <Link className="access" href={`/panel?institucion=${encodeURIComponent(ctx.institucionId)}`}>
          ← Volver al panel de {ctx.institucionNombre}
        </Link>
      </p>
      <header>
        <p className="eyebrow">Módulo Planificaciones Docentes</p>
        <h2>Propuestas curriculares y aprobación institucional</h2>
        <p>
          Institución: <strong>{ctx.institucionNombre}</strong> · Rol: <strong>{ctx.rol}</strong>
        </p>
      </header>

      <FormulariosPlanificaciones
        institucionId={ctx.institucionId}
        materias={materias}
        docentes={docentes}
        puedeAprobar={puedeAprobar}
      />

      <article>
        <h3>Planificaciones registradas ({planifs.length})</h3>
        {planifs.length === 0 ? (
          <p>Todavía no hay planificaciones cargadas.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
            {planifs.map((p) => {
              const mat = materias.find((m) => m.id === p.materia_id);
              const doc = docentes.find((d) => d.id === p.docente_id);
              return (
                <li key={p.id} className="papel">
                  <small>VERSIÓN {p.version} · {p.estado}</small>
                  <p>
                    <strong>{mat?.nombre ?? "Materia"}</strong> · Docente: {doc?.nombre ?? "—"}
                  </p>
                  <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{p.contenido}</p>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
