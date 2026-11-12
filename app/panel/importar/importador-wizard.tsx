"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmarImportacionPadron, confirmarImportacionPlan } from "./actions";
import type {
  AlertaConsistencia,
  CorrelativaFila,
  EstudianteFila,
  MateriaPlanFila,
  PlanEstudioExtraccion,
  ResultadoAnalisisDocumento,
  TipoIngesta,
} from "../../../lib/ingesta/tipos";

export function ImportadorWizard({
  institucionId,
  planesExistentes,
  iaDisponible,
}: {
  institucionId: string;
  planesExistentes: Array<{ id: string; carrera: string; codigo: string }>;
  iaDisponible: boolean;
}) {
  const [tipo, setTipo] = useState<TipoIngesta>("PADRON_ESTUDIANTES");
  const [planDestinoId, setPlanDestinoId] = useState(planesExistentes[0]?.id ?? "");
  const [cohorteDestino, setCohorteDestino] = useState(String(new Date().getFullYear()));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [confirmando, startConfirm] = useTransition();

  const [analisis, setAnalisis] = useState<ResultadoAnalisisDocumento | null>(null);
  const [estudiantes, setEstudiantes] = useState<EstudianteFila[]>([]);
  const [plan, setPlan] = useState<PlanEstudioExtraccion | null>(null);
  const [incluirReglaDefault, setIncluirReglaDefault] = useState(true);
  const [alertas, setAlertas] = useState<AlertaConsistencia[]>([]);
  const [estadoFinal, setEstadoFinal] = useState<{ ok: boolean; mensaje: string } | null>(null);

  async function analizarArchivo(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    setAnalizando(true);
    setEstadoFinal(null);

    try {
      const fd = new FormData();
      fd.set("institucion", institucionId);
      fd.set("tipo", tipo);
      fd.set("archivo", archivo);

      const res = await fetch("/api/importar/analizar", { method: "POST", body: fd });
      const data = (await res.json()) as ResultadoAnalisisDocumento & { error?: string };

      if (!res.ok) {
        setEstadoFinal({ ok: false, mensaje: data.error ?? "Error al analizar el archivo." });
        return;
      }

      setAnalisis(data);
      setAlertas(data.alertas ?? []);
      setEstudiantes(data.datosPadron ?? []);
      setPlan(data.datosPlan ?? null);
      if (!data.ok) {
        setEstadoFinal({ ok: false, mensaje: data.mensaje });
      }
    } catch {
      setEstadoFinal({ ok: false, mensaje: "Error de red al subir y analizar el documento." });
    } finally {
      setAnalizando(false);
    }
  }

  function actualizarEstudiante(index: number, campo: keyof EstudianteFila, valor: string) {
    setEstudiantes((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [campo]: valor } : row)),
    );
  }

  function agregarEstudiante() {
    setEstudiantes((prev) => [...prev, { documento: "", nombre: "" }]);
  }

  function quitarEstudiante(index: number) {
    setEstudiantes((prev) => prev.filter((_, i) => i !== index));
  }

  function actualizarMateria(index: number, campo: keyof MateriaPlanFila, valor: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      materias: plan.materias.map((m, i) => (i === index ? { ...m, [campo]: valor } : m)),
    });
  }

  function quitarMateria(index: number) {
    if (!plan) return;
    setPlan({ ...plan, materias: plan.materias.filter((_, i) => i !== index) });
  }

  function agregarMateria() {
    if (!plan) return;
    setPlan({
      ...plan,
      materias: [
        ...plan.materias,
        { codigo: `MAT-${String(plan.materias.length + 1).padStart(2, "0")}`, nombre: "" },
      ],
    });
  }

  function actualizarCorrelativa(index: number, campo: keyof CorrelativaFila, valor: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      correlativas: plan.correlativas.map((c, i) => (i === index ? { ...c, [campo]: valor } : c)),
    });
  }

  function quitarCorrelativa(index: number) {
    if (!plan) return;
    setPlan({ ...plan, correlativas: plan.correlativas.filter((_, i) => i !== index) });
  }

  function confirmarTodo() {
    if (!analisis) return;
    startConfirm(async () => {
      if (analisis.tipo === "PADRON_ESTUDIANTES") {
        if (!planDestinoId) {
          setEstadoFinal({ ok: false, mensaje: "Seleccioná primero el plan de estudio destino." });
          return;
        }
        const r = await confirmarImportacionPadron({
          institucionId,
          archivoNombre: analisis.archivoNombre,
          archivoSha256: analisis.archivoSha256,
          planId: planDestinoId,
          cohorte: Number(cohorteDestino),
          estudiantes: estudiantes.filter((s) => s.documento.trim() && s.nombre.trim()),
        });
        setEstadoFinal(r);
      } else if (plan) {
        const r = await confirmarImportacionPlan({
          institucionId,
          archivoNombre: analisis.archivoNombre,
          archivoSha256: analisis.archivoSha256,
          plan,
          incluirReglaDefault,
        });
        setEstadoFinal(r);
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div className="papel" style={{ background: "#eef5f2", borderColor: "#aac3b9" }}>
        <small>MOTOR HÍBRIDO DE INGESTA DOCUMENTAL</small>
        <p style={{ margin: "6px 0 0" }}>
          <strong>Carril Determinístico ($0):</strong> Excel (<code>.xlsx</code>, <code>.xls</code>), <code>.csv</code> y Word (<code>.docx</code>) tabulares se procesan localmente sin costo ni alucinaciones.
          <br />
          <strong>Carril IA Multimodal (Gemini 3.8 Flash):</strong> PDFs escaneados, diseños curriculares y resoluciones ministeriales{" "}
          {iaDisponible ? (
            <strong style={{ color: "#06594f" }}>[ACTIVO EN ESTE ENTORNO]</strong>
          ) : (
            <span style={{ color: "#94105E" }}>
              [Pendiente de configurar <code>GEMINI_API_KEY</code> para PDFs; Excel/CSV/Word ya operan 100% activos]
            </span>
          )}
        </p>
      </div>

      {/* PASO 1: SUBIDA */}
      <form onSubmit={analizarArchivo}>
        <h3>Paso 1 · Subir y analizar documento</h3>
        <div className="grid">
          <label>
            ¿Qué querés incorporar?
            <select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoIngesta);
                setAnalisis(null);
              }}
            >
              <option value="PADRON_ESTUDIANTES">Padrón de estudiantes (Excel / CSV / Word / PDF)</option>
              <option value="PLAN_ESTUDIO">Plan de estudio, materias y correlativas (PDF / Excel)</option>
            </select>
          </label>
          <label>
            Archivo institucional (máx. 4 MB)
            <input
              type="file"
              required
              accept=".xlsx,.xls,.csv,.docx,.pdf,.png,.jpg,.jpeg"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <button disabled={analizando || !archivo}>
          {analizando ? "Extrayendo y validando inconsistencias…" : "Analizar documento y generar vista previa →"}
        </button>
      </form>

      {estadoFinal && (
        <article style={{ borderColor: estadoFinal.ok ? "#06594f" : "#94105E" }}>
          <p><strong>{estadoFinal.mensaje}</strong></p>
          {estadoFinal.ok && (
            <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <Link className="access" href={`/panel/secretaria?institucion=${encodeURIComponent(institucionId)}`}>
                Ver resultados en Secretaría →
              </Link>
              <Link className="access" href={`/panel/normativa?institucion=${encodeURIComponent(institucionId)}`}>
                Ver reglas y correlativas en Normativa →
              </Link>
            </p>
          )}
        </article>
      )}

      {/* ALERTAS DE CONSISTENCIA */}
      {alertas.length > 0 && (
        <article>
          <h3>Auditoría previa de consistencia ({alertas.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {alertas.map((a, i) => (
              <li
                key={i}
                style={{
                  color: a.nivel === "error" ? "#94105E" : a.nivel === "advertencia" ? "#9a5b00" : "#06594f",
                  marginBottom: 6,
                }}
              >
                <strong>[{a.nivel.toUpperCase()}]</strong> {a.mensaje}
              </li>
            ))}
          </ul>
        </article>
      )}

      {/* PASO 2A: VISTA PREVIA PADRON DE ESTUDIANTES */}
      {analisis?.ok && analisis.tipo === "PADRON_ESTUDIANTES" && (
        <article>
          <h3>Paso 2 · Vista previa editable del padrón ({estudiantes.length} estudiantes)</h3>
          <p>Corregí cualquier documento o nombre antes de impactar en la base de datos. Origen: <strong>{analisis.carril}</strong> · Hash <code>{analisis.archivoSha256.slice(0, 12)}…</code></p>

          <div className="grid" style={{ marginBottom: 16 }}>
            <label>
              Plan de estudio donde matricular
              <select value={planDestinoId} onChange={(e) => setPlanDestinoId(e.target.value)}>
                <option value="">Elegí un plan…</option>
                {planesExistentes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.carrera} ({p.codigo})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cohorte de ingreso
              <input
                type="number"
                value={cohorteDestino}
                onChange={(e) => setCohorteDestino(e.target.value)}
              />
            </label>
          </div>

          <div style={{ overflowX: "auto", maxHeight: 420, border: "1px solid #d1dcd5", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ background: "#eef5f2", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ padding: 10, textAlign: "left" }}>#</th>
                  <th style={{ padding: 10, textAlign: "left" }}>DNI / Documento</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Apellido y Nombre</th>
                  <th style={{ padding: 10, textAlign: "center" }}>Quitar</th>
                </tr>
              </thead>
              <tbody>
                {estudiantes.map((row, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid #e3e8e4" }}>
                    <td style={{ padding: 6 }}>{idx + 1}</td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={row.documento}
                        onChange={(e) => actualizarEstudiante(idx, "documento", e.target.value)}
                        style={{ minHeight: 34, padding: "4px 8px" }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={row.nombre}
                        onChange={(e) => actualizarEstudiante(idx, "nombre", e.target.value)}
                        style={{ minHeight: 34, padding: "4px 8px" }}
                      />
                    </td>
                    <td style={{ padding: 6, textAlign: "center" }}>
                      <button
                        type="button"
                        className="access"
                        onClick={() => quitarEstudiante(idx)}
                        style={{ padding: "4px 10px" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <button type="button" className="access" onClick={agregarEstudiante}>
              + Agregar fila manual
            </button>
            <button
              type="button"
              disabled={confirmando || estudiantes.length === 0 || !planDestinoId}
              onClick={confirmarTodo}
            >
              {confirmando ? "Incorporando lote…" : "Paso 3 · Confirmar e incorporar padrón"}
            </button>
          </div>
        </article>
      )}

      {/* PASO 2B: VISTA PREVIA PLAN DE ESTUDIO */}
      {analisis?.ok && plan && (
        <article>
          <h3>Paso 2 · Vista previa editable del Plan de Estudio</h3>
          <p>Revisá resolución, materias y correlativas extraídas ({analisis.carril}).</p>

          <div className="grid">
            <label>
              Denominación oficial de la carrera
              <input
                value={plan.carrera}
                onChange={(e) => setPlan({ ...plan, carrera: e.target.value })}
              />
            </label>
            <label>
              Código corto
              <input
                value={plan.codigo}
                onChange={(e) => setPlan({ ...plan, codigo: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              Resolución jurisdiccional
              <input
                value={plan.resolucion_jurisdiccional}
                onChange={(e) => setPlan({ ...plan, resolucion_jurisdiccional: e.target.value })}
              />
            </label>
            <label>
              Resolución nacional (opcional)
              <input
                value={plan.resolucion_nacional ?? ""}
                onChange={(e) => setPlan({ ...plan, resolucion_nacional: e.target.value })}
              />
            </label>
            <label>
              Cohorte desde
              <input
                type="number"
                value={plan.cohorte_desde}
                onChange={(e) => setPlan({ ...plan, cohorte_desde: Number(e.target.value) })}
              />
            </label>
          </div>

          <h4>Unidades curriculares ({plan.materias.length})</h4>
          <div style={{ overflowX: "auto", maxHeight: 360, border: "1px solid #d1dcd5", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ background: "#eef5f2", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ padding: 8, textAlign: "left" }}>Código</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Nombre de la materia</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Ubicación</th>
                  <th style={{ padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {plan.materias.map((m, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid #e3e8e4" }}>
                    <td style={{ padding: 6 }}>
                      <input
                        value={m.codigo}
                        onChange={(e) => actualizarMateria(idx, "codigo", e.target.value.toUpperCase())}
                        style={{ minHeight: 34, width: 120 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={m.nombre}
                        onChange={(e) => actualizarMateria(idx, "nombre", e.target.value)}
                        style={{ minHeight: 34 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={m.anio_o_cuatrimestre ?? ""}
                        onChange={(e) => actualizarMateria(idx, "anio_o_cuatrimestre", e.target.value)}
                        style={{ minHeight: 34, width: 150 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <button type="button" className="access" onClick={() => quitarMateria(idx)} style={{ padding: "4px 10px" }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 10 }}>
            <button type="button" className="access" onClick={agregarMateria}>
              + Agregar materia
            </button>
          </p>

          <h4>Correlatividades detectadas ({plan.correlativas.length})</h4>
          {plan.correlativas.length === 0 ? (
            <p><small>No se detectaron correlatividades en este archivo (podés cargarlas después en Normativa).</small></p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              {plan.correlativas.map((c, idx) => (
                <li key={idx} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={c.materia_codigo}
                    onChange={(e) => actualizarCorrelativa(idx, "materia_codigo", e.target.value.toUpperCase())}
                    style={{ width: 110, minHeight: 34 }}
                    placeholder="Objetivo"
                  />
                  <span>requiere</span>
                  <input
                    value={c.requisito_codigo}
                    onChange={(e) => actualizarCorrelativa(idx, "requisito_codigo", e.target.value.toUpperCase())}
                    style={{ width: 110, minHeight: 34 }}
                    placeholder="Requisito"
                  />
                  <select
                    value={c.instancia}
                    onChange={(e) => actualizarCorrelativa(idx, "instancia", e.target.value)}
                    style={{ width: 120, minHeight: 34 }}
                  >
                    <option value="CURSAR">CURSAR</option>
                    <option value="RENDIR">RENDIR</option>
                  </select>
                  <select
                    value={c.condicion}
                    onChange={(e) => actualizarCorrelativa(idx, "condicion", e.target.value)}
                    style={{ width: 130, minHeight: 34 }}
                  >
                    <option value="REGULAR">REGULAR</option>
                    <option value="APROBADA">APROBADA</option>
                  </select>
                  <button type="button" className="access" onClick={() => quitarCorrelativa(idx)} style={{ padding: "4px 10px" }}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
            <input
              type="checkbox"
              checked={incluirReglaDefault}
              onChange={(e) => setIncluirReglaDefault(e.target.checked)}
              style={{ width: 18, minHeight: 18 }}
            />
            Crear regla académica base RAM (75% asistencia / 60% justificada / nota 6 / 7 turnos) al confirmar
          </label>

          <p style={{ marginTop: 16 }}>
            <button type="button" disabled={confirmando || plan.materias.length === 0} onClick={confirmarTodo}>
              {confirmando ? "Incorporando plan…" : "Paso 3 · Confirmar e incorporar plan completo"}
            </button>
          </p>
        </article>
      )}
    </div>
  );
}
