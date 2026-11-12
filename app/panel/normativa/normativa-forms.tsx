"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarCalendarioOficial, guardarReglaRam } from "../actions";

export function FormularioCalendario({ institucionId }: { institucionId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [ciclo, setCiclo] = useState("2026");
  const [normativa, setNormativa] = useState("");
  const [cursadoInicio, setCursadoInicio] = useState("");
  const [cursadoFin, setCursadoFin] = useState("");
  const [recesoInicio, setRecesoInicio] = useState("");
  const [recesoFin, setRecesoFin] = useState("");
  const [cierreAdmin, setCierreAdmin] = useState("");
  const [turnosJson, setTurnosJson] = useState("[]");

  function cargarMisiones2026() {
    setCiclo("2026");
    setNormativa("Res. MECyT N° 704/25 y CGE N° 8045 (Misiones, 28/11/2025)");
    setCursadoInicio("2026-03-30");
    setCursadoFin("2026-11-13");
    setRecesoInicio("2026-07-13");
    setRecesoFin("2026-07-24");
    setCierreAdmin("2026-12-18");
    setTurnosJson(
      JSON.stringify(
        [
          { codigo: "FEB-MAR-2026", nombre: "Febrero - Marzo 2026", inicio: "2026-02-25", fin: "2026-03-25", llamados: 2 },
          { codigo: "JUL-AGO-2026", nombre: "Julio - Agosto 2026", inicio: "2026-07-27", fin: "2026-08-07", llamados: 1 },
          { codigo: "NOV-DIC-2026", nombre: "Noviembre - Diciembre 2026", inicio: "2026-11-16", fin: "2026-12-17", llamados: 2 },
        ],
        null,
        2,
      ),
    );
    setMsg("Plantilla oficial Misiones 2026 precargada. Verificá los datos y guardá.");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await guardarCalendarioOficial(fd);
          setMsg(r.mensaje);
          if (r.ok) router.refresh();
        });
      }}
    >
      <h3>Configurar calendario jurisdiccional</h3>
      <p>
        <button type="button" className="access" onClick={cargarMisiones2026}>
          Precargar Calendario Oficial Misiones 2026 (Res. 704/25 · CGE 8045)
        </button>
      </p>
      <input type="hidden" name="institucion" value={institucionId} />
      <label>
        Ciclo lectivo
        <input name="ciclo" type="number" required value={ciclo} onChange={(e) => setCiclo(e.target.value)} />
      </label>
      <label>
        Resolución / norma jurisdiccional
        <input name="normativa" required value={normativa} onChange={(e) => setNormativa(e.target.value)} placeholder="Ej. Res. MECyT 704/25" />
      </label>
      <div className="grid">
        <label>
          Inicio de cursado
          <input name="cursado_inicio" type="date" required value={cursadoInicio} onChange={(e) => setCursadoInicio(e.target.value)} />
        </label>
        <label>
          Fin de cursado
          <input name="cursado_fin" type="date" required value={cursadoFin} onChange={(e) => setCursadoFin(e.target.value)} />
        </label>
        <label>
          Inicio receso invierno
          <input name="receso_inicio" type="date" value={recesoInicio} onChange={(e) => setRecesoInicio(e.target.value)} />
        </label>
        <label>
          Fin receso invierno
          <input name="receso_fin" type="date" value={recesoFin} onChange={(e) => setRecesoFin(e.target.value)} />
        </label>
        <label>
          Cierre administrativo
          <input name="cierre_administrativo" type="date" required value={cierreAdmin} onChange={(e) => setCierreAdmin(e.target.value)} />
        </label>
      </div>
      <label>
        Turnos oficiales de examen (JSON)
        <textarea name="turnos_json" value={turnosJson} onChange={(e) => setTurnosJson(e.target.value)} />
      </label>
      <button disabled={busy}>{busy ? "Guardando…" : "Guardar calendario institucional"}</button>
      {msg && <p role="status">{msg}</p>}
    </form>
  );
}

export function FormularioReglaRam({
  institucionId,
  planes,
}: {
  institucionId: string;
  planes: Array<{ id: string; carrera: string; codigo: string }>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await guardarReglaRam(fd);
          setMsg(r.mensaje);
          if (r.ok) router.refresh();
        });
      }}
    >
      <h3>Versionar regla académica (RAM / RAI)</h3>
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
      <div className="grid">
        <label>
          Modalidad de nivel superior
          <select name="nivel_tipo" defaultValue="TECNICO_SUPERIOR">
            <option value="TECNICO_SUPERIOR">Instituto Técnico Superior</option>
            <option value="PROFESORADO">ISFD / Profesorado</option>
            <option value="UNIVERSITARIO">Universitario</option>
          </select>
        </label>
        <label>
          Vigente desde
          <input name="vigente_desde" type="date" defaultValue={hoy} required />
        </label>
        <label>
          Normativa fuente (RAM/RAI)
          <input name="fuente" required placeholder="Ej. RAM Res. 051/19 + RAI Art. 14" />
        </label>
        <label>
          Asistencia mínima regular (%)
          <input name="asistencia_min" type="number" step="0.5" min="0" max="100" defaultValue="75" required />
        </label>
        <label>
          Asistencia mínima justificada (%)
          <input name="asistencia_justificada_min" type="number" step="0.5" min="0" max="100" defaultValue="60" />
        </label>
        <label>
          Peso de tardanza / retiro
          <input name="peso_tardanza" type="number" step="0.25" min="0" max="1" defaultValue="0.5" required />
        </label>
        <label>
          Nota mínima aprobación
          <input name="aprobacion" type="number" step="0.5" defaultValue="6" required />
        </label>
        <label>
          Nota promoción directa (opcional)
          <input name="promocion" type="number" step="0.5" placeholder="Vacío si no promociona" />
        </label>
        <label>
          Vigencia de regularidad
          <input name="turnos_vigencia" type="number" min="1" defaultValue="7" />
        </label>
        <label>
          Unidad de vigencia
          <select name="vigencia_unidad" defaultValue="TURNOS">
            <option value="TURNOS">Turnos oficiales de examen</option>
            <option value="ANIOS">Años calendario</option>
          </select>
        </label>
        <label>
          ¿Admite examen libre?
          <select name="admite_libre" defaultValue="si">
            <option value="si">Sí</option>
            <option value="no">No (requiere recursado)</option>
          </select>
        </label>
      </div>
      <input type="hidden" name="escala_min" value="1" />
      <input type="hidden" name="escala_max" value="10" />
      <button disabled={busy || planes.length === 0}>{busy ? "Guardando…" : "Registrar versión RAM/RAI"}</button>
      {planes.length === 0 && <small>Primero creá un plan de estudio en el módulo de Secretaría.</small>}
      {msg && <p role="status">{msg}</p>}
    </form>
  );
}
