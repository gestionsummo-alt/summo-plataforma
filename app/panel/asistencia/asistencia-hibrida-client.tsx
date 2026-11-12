"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  eliminarLoteCola,
  encolarLoteOffline,
  guardarNominaLocal,
  leerNominaLocal,
  listarColaParticion,
  marcarConflictoLote,
  type LoteAsistenciaOffline,
  type NominaCursadaHibrida,
} from "../../../lib/hibrido/cola-indexeddb";
import { sincronizarAsistenciasServer } from "../actions";

function suscribirRed(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function AsistenciaHibridaClient({
  institucionId,
  usuarioId,
  materias,
  nominasPorMateria,
  ciclo,
  fechaHoy,
}: {
  institucionId: string;
  usuarioId: string;
  materias: Array<{ id: string; nombre: string; codigo: string }>;
  nominasPorMateria: Record<string, NominaCursadaHibrida[]>;
  ciclo: number;
  fechaHoy: string;
}) {
  const online = useSyncExternalStore(suscribirRed, () => navigator.onLine, () => true);
  const [materiaId, setMateriaId] = useState(materias[0]?.id ?? "");
  const [fecha, setFecha] = useState(fechaHoy);
  const [nomina, setNomina] = useState<NominaCursadaHibrida[]>([]);
  const [pesos, setPesos] = useState<Record<string, number>>({});
  const [cola, setCola] = useState<LoteAsistenciaOffline[]>([]);
  const [aviso, setAviso] = useState("");
  const [origenDatos, setOrigenDatos] = useState<"nube" | "offline">("nube");

  const refrescarCola = useCallback(async () => {
    setCola(await listarColaParticion(institucionId, usuarioId));
  }, [institucionId, usuarioId]);

  const sincronizarCola = useCallback(async () => {
    if (!navigator.onLine) {
      setAviso("Sin señal: las planillas siguen resguardadas en este dispositivo.");
      return;
    }
    const pendientes = await listarColaParticion(institucionId, usuarioId);
    if (!pendientes.length) {
      setAviso("No hay planillas pendientes de sincronizar.");
      return;
    }
    let okCount = 0;
    for (const lote of pendientes) {
      const r = await sincronizarAsistenciasServer({
        institucionId: lote.institucionId,
        ciclo: lote.ciclo,
        fecha: lote.fecha,
        origen: "PWA_OFFLINE",
        registros: lote.registros,
      });
      if (r.ok) {
        await eliminarLoteCola(lote.clave);
        okCount += 1;
      } else {
        await marcarConflictoLote(lote.clave, r.mensaje);
        setAviso(`Conflicto al sincronizar ${lote.materiaNombre} (${lote.fecha}): ${r.mensaje}`);
      }
    }
    await refrescarCola();
    if (okCount > 0) setAviso(`Sincronizadas ${okCount} planilla(s) con idempotencia garantizada.`);
  }, [institucionId, usuarioId, refrescarCola]);

  useEffect(() => {
    void refrescarCola();
    const onOnline = () => {
      void sincronizarCola();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refrescarCola, sincronizarCola]);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (!materiaId) {
        setNomina([]);
        return;
      }
      const servidor = nominasPorMateria[materiaId];
      if (servidor && servidor.length >= 0) {
        await guardarNominaLocal(institucionId, usuarioId, materiaId, ciclo, servidor);
        if (activo) {
          setNomina(servidor);
          setOrigenDatos("nube");
        }
        return;
      }
      const cache = await leerNominaLocal(institucionId, usuarioId, materiaId, ciclo);
      if (activo) {
        setNomina(cache ?? []);
        setOrigenDatos("offline");
      }
    })();
    return () => {
      activo = false;
    };
  }, [institucionId, usuarioId, materiaId, ciclo, nominasPorMateria]);

  async function guardarPlanilla() {
    if (!materiaId || nomina.length === 0) return;
    const matNombre = materias.find((m) => m.id === materiaId)?.nombre ?? materiaId;
    const registros = nomina.map((n) => ({
      cursada_id: n.cursada_id,
      peso_falta: pesos[n.cursada_id] ?? 0,
      idempotency_key: crypto.randomUUID(),
    }));

    if (navigator.onLine) {
      const res = await sincronizarAsistenciasServer({
        institucionId,
        ciclo,
        fecha,
        origen: "ONLINE",
        registros,
      });
      if (res.ok) {
        setAviso(res.mensaje);
        return;
      }
      setAviso(`No se pudo enviar directo (${res.mensaje}). Se encoló localmente para revisión.`);
    }

    await encolarLoteOffline({
      institucionId,
      usuarioId,
      materiaId,
      materiaNombre: matNombre,
      ciclo,
      fecha,
      registros,
    });
    await refrescarCola();
    setAviso("Planilla guardada localmente en IndexedDB particionado (pendiente de sincronización).");
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="papel" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <span>
          Estado de red: <strong>{online ? "En línea (sincronización activa)" : "Sin conexión (Modo Híbrido Local)"}</strong> ·
          Nómina desde <strong>{origenDatos}</strong>
        </span>
        <button type="button" className="access" onClick={() => void sincronizarCola()}>
          Sincronizar cola ({cola.length})
        </button>
      </div>

      {aviso && (
        <p role="status" className="papel">
          <strong>{aviso}</strong>
        </p>
      )}

      <article>
        <div className="grid">
          <label>
            Unidad curricular
            <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.codigo})
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha de clase
            <input type="date" value={fecha} max={fechaHoy} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>

        {nomina.length === 0 ? (
          <p>No hay cursadas inscriptas en esta materia para el ciclo {ciclo}.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
            {nomina.map((est) => {
              const actual = pesos[est.cursada_id] ?? 0;
              return (
                <li
                  key={est.cursada_id}
                  style={{
                    border: "1px solid #d1dcd5",
                    borderRadius: 6,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div>
                    <strong>{est.estudiante_nombre}</strong>
                    <div style={{ fontSize: 13, color: "#51655c" }}>
                      Doc. {est.estudiante_documento} · Com. {est.comision}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "Presente (0)", val: 0 },
                      { label: "Tardanza (0.5)", val: 0.5 },
                      { label: "Ausente (1)", val: 1 },
                    ].map((op) => (
                      <button
                        key={op.val}
                        type="button"
                        onClick={() => setPesos((p) => ({ ...p, [est.cursada_id]: op.val }))}
                        style={{
                          background: actual === op.val ? "#06594f" : "#ffffff",
                          color: actual === op.val ? "#ffffff" : "#172c36",
                          border: "1px solid #85998f",
                          padding: "8px 12px",
                        }}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p style={{ marginTop: 16 }}>
          <button type="button" disabled={!materiaId || nomina.length === 0} onClick={() => void guardarPlanilla()}>
            Registrar asistencia híbrida
          </button>
        </p>
      </article>

      {cola.length > 0 && (
        <article>
          <h3>Cola local pendiente / conflictos ({cola.length})</h3>
          <ul>
            {cola.map((l) => (
              <li key={l.clave}>
                <strong>{l.materiaNombre}</strong> · {l.fecha} · <strong>{l.estado}</strong>
                {l.ultimoError ? ` — ${l.ultimoError}` : ""}
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}
