import Link from "next/link";
import { obtenerContextoInstitucional } from "../../../lib/institucion-activa";
import { FormularioCalendario, FormularioCorrelativa, FormularioReglaRam } from "./normativa-forms";

export default async function NormativaPage({
  searchParams,
}: {
  searchParams: Promise<{ institucion?: string }>;
}) {
  const { institucion } = await searchParams;
  const ctx = await obtenerContextoInstitucional(institucion, "normativa");

  const [ciclosRes, turnosRes, planesRes, reglasRes, materiasRes, corrRes] = await Promise.all([
    ctx.db
      .from("calendarios_ciclos")
      .select("ciclo,normativa_fuente,cursado_inicio,cursado_fin,receso_inicio,receso_fin,cierre_administrativo")
      .eq("institucion_id", ctx.institucionId)
      .order("ciclo", { ascending: false }),
    ctx.db
      .from("calendarios_turnos")
      .select("ciclo,codigo,nombre,inicio,fin,llamados")
      .eq("institucion_id", ctx.institucionId)
      .order("inicio"),
    ctx.db
      .from("planes")
      .select("id,carrera,codigo")
      .eq("institucion_id", ctx.institucionId)
      .order("carrera"),
    ctx.db
      .from("reglas")
      .select("id,plan_id,version,vigente_desde,fuente,nivel_tipo,asistencia_min,asistencia_justificada_min,aprobacion,promocion,turnos_vigencia,vigencia_unidad,admite_libre")
      .eq("institucion_id", ctx.institucionId)
      .order("vigente_desde", { ascending: false })
      .order("version", { ascending: false }),
    ctx.db
      .from("materias")
      .select("id,codigo,nombre")
      .eq("institucion_id", ctx.institucionId)
      .order("nombre"),
    ctx.db
      .from("correlativas")
      .select("id,materia_id,requisito_id,instancia,condicion")
      .eq("institucion_id", ctx.institucionId),
  ]);

  const planes = (planesRes.data ?? []) as Array<{ id: string; carrera: string; codigo: string }>;
  const materias = (materiasRes.data ?? []) as Array<{ id: string; codigo: string; nombre: string }>;
  const correlativas = (corrRes.data ?? []) as Array<{ id: string; materia_id: string; requisito_id: string; instancia: string; condicion: string }>;
  const ciclos = ciclosRes.data ?? [];
  const turnos = turnosRes.data ?? [];
  const reglas = reglasRes.data ?? [];
  const puedeEscribir = ["direccion", "secretaria"].includes(ctx.rol);

  return (
    <section style={{ display: "grid", gap: 22 }}>
      <p>
        <Link className="access" href={`/panel?institucion=${encodeURIComponent(ctx.institucionId)}`}>
          ← Volver al panel de {ctx.institucionNombre}
        </Link>
      </p>
      <header>
        <p className="eyebrow">Módulo Normativa · {ctx.jurisdiccion}</p>
        <h2>Calendarios jurisdiccionales y reglas RAM / RAI</h2>
        <p>
          Institución: <strong>{ctx.institucionNombre}</strong> · Rol: <strong>{ctx.rol}</strong>
        </p>
      </header>

      <article>
        <h3>Calendarios cargados</h3>
        {ciclos.length === 0 ? (
          <p>Todavía no hay calendarios configurados para esta institución.</p>
        ) : (
          <div className="grid">
            {ciclos.map((c) => (
              <div key={c.ciclo} className="papel">
                <small>CICLO {c.ciclo}</small>
                <p><strong>{c.normativa_fuente}</strong></p>
                <p>Cursado: {c.cursado_inicio} al {c.cursado_fin}</p>
                {c.receso_inicio && <p>Receso: {c.receso_inicio} al {c.receso_fin}</p>}
                <p>Cierre administrativo: {c.cierre_administrativo}</p>
                <ul>
                  {turnos.filter((t) => t.ciclo === c.ciclo).map((t) => (
                    <li key={t.codigo}>
                      {t.nombre}: {t.inicio} al {t.fin} ({t.llamados} ll.)
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </article>

      <article>
        <h3>Versiones de reglas académicas vigentes</h3>
        {reglas.length === 0 ? (
          <p>Todavía no hay reglas RAM/RAI cargadas.</p>
        ) : (
          <ul>
            {reglas.map((r) => {
              const plan = planes.find((p) => p.id === r.plan_id);
              return (
                <li key={r.id} style={{ marginBottom: 10 }}>
                  <strong>{plan?.carrera ?? r.plan_id}</strong> · v{r.version} ({r.nivel_tipo}) · desde {r.vigente_desde} · Asist. {r.asistencia_min}%
                  {r.asistencia_justificada_min != null ? ` / justif. ${r.asistencia_justificada_min}%` : ""} · Nota ≥ {r.aprobacion}
                  {r.promocion != null ? ` · Prom. ≥ ${r.promocion}` : ""} · Vigencia: {r.turnos_vigencia ?? "—"} {r.vigencia_unidad} · {r.fuente}
                </li>
              );
            })}
          </ul>
        )}
      </article>

      <article>
        <h3>Correlatividades vigentes ({correlativas.length})</h3>
        {correlativas.length === 0 ? (
          <p>Todavía no hay correlativas configuradas.</p>
        ) : (
          <ul>
            {correlativas.map((c) => {
              const obj = materias.find((m) => m.id === c.materia_id);
              const req = materias.find((m) => m.id === c.requisito_id);
              return (
                <li key={c.id}>
                  Para <strong>{c.instancia}</strong> <strong>{obj?.nombre ?? "—"}</strong> requiere{" "}
                  <strong>{req?.nombre ?? "—"}</strong> en condición <strong>{c.condicion}</strong>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      {puedeEscribir && (
        <>
          <FormularioCalendario institucionId={ctx.institucionId} />
          <FormularioReglaRam institucionId={ctx.institucionId} planes={planes} />
          <FormularioCorrelativa institucionId={ctx.institucionId} materias={materias} />
        </>
      )}
    </section>
  );
}
