"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearMateria, crearPlan, inscribirCursada, matricularEstudiante } from "../actions";

export function FormulariosSecretaria({
  institucionId,
  planes,
  materias,
  matriculas,
}: {
  institucionId: string;
  planes: Array<{ id: string; carrera: string; codigo: string }>;
  materias: Array<{ id: string; plan_id: string; codigo: string; nombre: string }>;
  matriculas: Array<{ id: string; persona_nombre: string; persona_doc: string; cohorte: number }>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  const anioActual = new Date().getFullYear();

  function ejecutar(accion: (fd: FormData) => Promise<{ ok: boolean; mensaje: string }>) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      start(async () => {
        const res = await accion(fd);
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
        <form onSubmit={ejecutar(crearPlan)}>
          <h3>1. Alta de plan de estudio</h3>
          <input type="hidden" name="institucion" value={institucionId} />
          <label>
            Nombre de la carrera
            <input name="carrera" required placeholder="Ej. Tecnicatura en Software" />
          </label>
          <label>
            Código corto
            <input name="codigo" required placeholder="Ej. TSD" />
          </label>
          <label>
            Resolución jurisdiccional
            <input name="resolucion_jurisdiccional" required placeholder="Ej. Res. ME 123/24" />
          </label>
          <label>
            Resolución nacional (opcional)
            <input name="resolucion_nacional" placeholder="Ej. RM 456/25" />
          </label>
          <label>
            Cohorte desde
            <input name="cohorte_desde" type="number" defaultValue={anioActual} required />
          </label>
          <button disabled={busy}>Crear plan</button>
        </form>

        <form onSubmit={ejecutar(crearMateria)}>
          <h3>2. Alta de unidad curricular</h3>
          <input type="hidden" name="institucion" value={institucionId} />
          <label>
            Plan de estudio
            <select name="plan_id" required defaultValue="">
              <option value="" disabled>Elegí un plan…</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.carrera} ({p.codigo})
                </option>
              ))}
            </select>
          </label>
          <label>
            Código
            <input name="codigo" required placeholder="Ej. PRG-1" />
          </label>
          <label>
            Nombre
            <input name="nombre" required placeholder="Ej. Programación I" />
          </label>
          <button disabled={busy || planes.length === 0}>Crear materia</button>
        </form>

        <form onSubmit={ejecutar(matricularEstudiante)}>
          <h3>3. Matricular estudiante</h3>
          <input type="hidden" name="institucion" value={institucionId} />
          <label>
            DNI / Documento
            <input name="documento" required placeholder="Ej. 40123456" />
          </label>
          <label>
            Apellido y nombre
            <input name="nombre" required placeholder="Ej. Pérez Ana Laura" />
          </label>
          <label>
            Plan de estudio
            <select name="plan_id" required defaultValue="">
              <option value="" disabled>Elegí un plan…</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.carrera} ({p.codigo})
                </option>
              ))}
            </select>
          </label>
          <label>
            Cohorte de ingreso
            <input name="cohorte" type="number" defaultValue={anioActual} required />
          </label>
          <button disabled={busy || planes.length === 0}>Matricular</button>
        </form>

        <form onSubmit={ejecutar(inscribirCursada)}>
          <h3>4. Habilitar cursada del ciclo</h3>
          <input type="hidden" name="institucion" value={institucionId} />
          <label>
            Estudiante matriculado
            <select name="matricula_id" required defaultValue="">
              <option value="" disabled>Elegí matrícula…</option>
              {matriculas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.persona_nombre} ({m.persona_doc}) · Cohorte {m.cohorte}
                </option>
              ))}
            </select>
          </label>
          <label>
            Materia
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
            Ciclo de dictado
            <input name="ciclo" type="number" defaultValue={anioActual} required />
          </label>
          <label>
            Comisión
            <input name="comision" defaultValue="A" />
          </label>
          <button disabled={busy || matriculas.length === 0 || materias.length === 0}>
            Habilitar cursada
          </button>
        </form>
      </div>
    </div>
  );
}
