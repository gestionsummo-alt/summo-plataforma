"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearMesa, guardarActaExamen, inscribirExamen } from "../actions";
import { evaluarCondicionExamen, type ResultadoActaItem } from "../../../lib/hibrido/fusion-acta";

export function FormulariosMesas({
  institucionId,
  materias,
  mesas,
  matriculas,
}: {
  institucionId: string;
  materias: Array<{ id: string; codigo: string; nombre: string }>;
  mesas: Array<{ id: string; materia_nombre: string; fecha: string; llamado: number }>;
  matriculas: Array<{ id: string; persona_nombre: string; persona_doc: string }>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");

  function submit(action: (fd: FormData) => Promise<{ ok: boolean; mensaje: string }>) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      start(async () => {
        const res = await action(fd);
        setMsg(res.mensaje);
        if (res.ok) {
          form.reset();
          router.refresh();
        }
      });
    };
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {msg && (
        <p role="status" className="papel">
          <strong>{msg}</strong>
        </p>
      )}
      <div className="grid">
        <form onSubmit={submit(crearMesa)}>
          <h3>1. Habilitar mesa de examen</h3>
          <input type="hidden" name="institucion" value={institucionId} />
          <label>
            Unidad curricular
            <select name="materia_id" required defaultValue="">
              <option value="" disabled>Elegí materia…</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.codigo})
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha y hora del examen
            <input name="fecha" type="datetime-local" required />
          </label>
          <label>
            Cierre de inscripción (anterior al examen)
            <input name="cierre" type="datetime-local" required />
          </label>
          <label>
            Llamado
            <input name="llamado" type="number" min="1" max="4" defaultValue="1" required />
          </label>
          <button disabled={busy || materias.length === 0}>Crear mesa</button>
        </form>

        <form onSubmit={submit(inscribirExamen)}>
          <h3>2. Inscribir estudiante a mesa</h3>
          <input type="hidden" name="institucion" value={institucionId} />
          <label>
            Mesa publicada
            <select name="mesa_id" required defaultValue="">
              <option value="" disabled>Elegí mesa…</option>
              {mesas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.materia_nombre} · {m.llamado}º ll. · {new Date(m.fecha).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estudiante matriculado
            <select name="matricula_id" required defaultValue="">
              <option value="" disabled>Elegí estudiante…</option>
              {matriculas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.persona_nombre} ({m.persona_doc})
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || mesas.length === 0 || matriculas.length === 0}>
            Inscribir (verifica correlativas)
          </button>
        </form>
      </div>
    </div>
  );
}

export function EditorActaExamen({
  institucionId,
  mesaId,
  materiaNombre,
  regla,
  inscriptos,
  resultadosIniciales,
  actaDefinitiva,
  tieneVolante,
}: {
  institucionId: string;
  mesaId: string;
  materiaNombre: string;
  regla: { id: string; aprobacion: number; escala_min: number; escala_max: number } | null;
  inscriptos: Array<{ inscripcion_id: string; estudiante_nombre: string; estudiante_doc: string }>;
  resultadosIniciales: ResultadoActaItem[];
  actaDefinitiva: { version: number; referencia: string } | null;
  tieneVolante: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [referencia, setReferencia] = useState(actaDefinitiva?.referencia ?? `ACTA-${mesaId.slice(0, 6).toUpperCase()}`);
  const [notas, setNotas] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of resultadosIniciales) {
      map[r.inscripcion_id] = r.nota == null ? "" : String(r.nota);
    }
    return map;
  });
  const [ausentes, setAusentes] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const r of resultadosIniciales) {
      map[r.inscripcion_id] = r.condicion === "AUSENTE";
    }
    return map;
  });
  const [msg, setMsg] = useState("");

  function enviar(cerrarDefinitiva: boolean) {
    if (!regla) return;
    const payload: ResultadoActaItem[] = inscriptos.map((i) => {
      const esAus = Boolean(ausentes[i.inscripcion_id]);
      const raw = (notas[i.inscripcion_id] ?? "").trim();
      const notaNum = !esAus && raw !== "" ? Number(raw) : null;
      return {
        inscripcion_id: i.inscripcion_id,
        nota: notaNum,
        condicion: evaluarCondicionExamen(notaNum, esAus, regla.aprobacion),
      };
    });

    start(async () => {
      const r = await guardarActaExamen({
        institucionId,
        mesaId,
        reglaId: regla.id,
        referencia,
        cerrarDefinitiva,
        origen: "ONLINE",
        resultados: payload,
      });
      setMsg(r.mensaje);
      if (r.ok) router.refresh();
    });
  }

  return (
    <article style={{ borderColor: actaDefinitiva ? "#06594f" : "#d1dcd5" }}>
      <small>{actaDefinitiva ? `ACTA DEFINITIVA v${actaDefinitiva.version} CERRADA` : tieneVolante ? "CON ACTA VOLANTE LISTA PARA REVISIÓN" : "SIN ACTA"}</small>
      <h3>{materiaNombre}</h3>
      {!regla ? (
        <p>Configurá una regla académica para el plan de esta materia en Normativa antes de emitir el acta.</p>
      ) : inscriptos.length === 0 ? (
        <p>Todavía no hay estudiantes inscriptos en esta mesa.</p>
      ) : (
        <>
          <label>
            Referencia / Folio de acta
            <input
              value={referencia}
              disabled={Boolean(actaDefinitiva)}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </label>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {inscriptos.map((ins) => {
              const esAus = Boolean(ausentes[ins.inscripcion_id]);
              const valStr = notas[ins.inscripcion_id] ?? "";
              const numVal = !esAus && valStr !== "" ? Number(valStr) : null;
              const cond = evaluarCondicionExamen(numVal, esAus, regla.aprobacion);
              return (
                <li
                  key={ins.inscripcion_id}
                  style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #e3e8e4", paddingBottom: 8 }}
                >
                  <span style={{ flex: "1 1 220px" }}>
                    <strong>{ins.estudiante_nombre}</strong> ({ins.estudiante_doc})
                  </span>
                  <input
                    type="number"
                    min={regla.escala_min}
                    max={regla.escala_max}
                    step="0.5"
                    disabled={Boolean(actaDefinitiva) || esAus}
                    value={esAus ? "" : valStr}
                    onChange={(e) => setNotas((n) => ({ ...n, [ins.inscripcion_id]: e.target.value }))}
                    placeholder="Nota"
                    style={{ width: 90 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, width: "auto" }}>
                    <input
                      type="checkbox"
                      disabled={Boolean(actaDefinitiva)}
                      checked={esAus}
                      onChange={(e) => setAusentes((a) => ({ ...a, [ins.inscripcion_id]: e.target.checked }))}
                      style={{ width: 18, minHeight: 18 }}
                    />
                    Ausente
                  </label>
                  <strong>{cond}</strong>
                </li>
              );
            })}
          </ul>
          {!actaDefinitiva && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" disabled={busy} className="access" onClick={() => enviar(false)}>
                Guardar acta VOLANTE
              </button>
              <button type="button" disabled={busy || !tieneVolante} onClick={() => enviar(true)}>
                Cerrar acta DEFINITIVA (inmutable)
              </button>
            </div>
          )}
        </>
      )}
      {msg && <p role="status"><strong>{msg}</strong></p>}
    </article>
  );
}
