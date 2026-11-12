"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarPlanificacion, registrarDocente } from "../actions";

export function FormulariosPlanificaciones({
  institucionId,
  materias,
  docentes,
  puedeAprobar,
}: {
  institucionId: string;
  materias: Array<{ id: string; codigo: string; nombre: string }>;
  docentes: Array<{ id: string; documento: string; nombre: string }>;
  puedeAprobar: boolean;
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
        {puedeAprobar && (
          <form onSubmit={submit(registrarDocente)}>
            <h3>Registrar docente en padrón</h3>
            <input type="hidden" name="institucion" value={institucionId} />
            <label>
              DNI / Documento
              <input name="documento" required placeholder="Ej. 30123456" />
            </label>
            <label>
              Apellido y nombre
              <input name="nombre" required placeholder="Ej. Gómez Carlos" />
            </label>
            <button disabled={busy}>Registrar docente</button>
          </form>
        )}

        <form onSubmit={submit(guardarPlanificacion)}>
          <h3>Cargar nueva versión de planificación</h3>
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
            Docente titular / a cargo
            <select name="docente_id" required defaultValue="">
              <option value="" disabled>Elegí docente…</option>
              {docentes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} (DNI {d.documento})
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado de la versión
            <select name="estado" defaultValue="BORRADOR">
              <option value="BORRADOR">Borrador</option>
              <option value="EN_REVISION">Enviar a revisión</option>
              {puedeAprobar && <option value="APROBADA">Aprobar institucionalmente</option>}
            </select>
          </label>
          <label>
            Contenidos, metodología, criterios de evaluación y bibliografía
            <textarea name="contenido" required minLength={10} placeholder="Detalle programático de la unidad curricular..." />
          </label>
          <button disabled={busy || materias.length === 0 || docentes.length === 0}>
            Guardar versión
          </button>
          {(materias.length === 0 || docentes.length === 0) && (
            <small>Requiere al menos una materia (Secretaría) y un docente registrado.</small>
          )}
        </form>
      </div>
    </div>
  );
}
