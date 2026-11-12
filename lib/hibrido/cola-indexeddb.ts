/**
 * Motor de almacenamiento híbrido particionado por (institucionId, usuarioId)
 * para SUMMO — Tecnología híbrida para sistemas de gestión educativa.
 *
 * Reglas de seguridad multi-tenant offline:
 *   - Cada registro en IndexedDB lleva clave compuesta por institucionId + usuarioId.
 *   - Incluye caducidad local (TTL 7 días) y limpieza explícita al cerrar sesión.
 *   - Toda operación pendiente lleva idempotency_key único para reintentos seguros.
 */

export interface NominaCursadaHibrida {
  cursada_id: string;
  estudiante_nombre: string;
  estudiante_documento: string;
  materia_nombre: string;
  comision: string;
}

export interface LoteAsistenciaOffline {
  clave: string; // `${institucionId}:${usuarioId}:${materiaId}:${ciclo}:${fecha}`
  institucionId: string;
  usuarioId: string;
  materiaId: string;
  materiaNombre: string;
  ciclo: number;
  fecha: string;
  creadoEn: string;
  expiraEn: string;
  estado: "PENDIENTE" | "CONFLICTO";
  ultimoError?: string;
  registros: Array<{
    cursada_id: string;
    peso_falta: number;
    idempotency_key: string;
  }>;
}

const DB_NAME = "summo_hibrido_v1";
const DB_VERSION = 1;
const STORE_NOMINAS = "nominas_particionadas";
const STORE_COLA = "cola_asistencias";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NOMINAS)) {
        db.createObjectStore(STORE_NOMINAS, { keyPath: "clave" });
      }
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        db.createObjectStore(STORE_COLA, { keyPath: "clave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function claveParticion(institucionId: string, usuarioId: string, extra: string): string {
  return `${institucionId}:${usuarioId}:${extra}`;
}

export async function guardarNominaLocal(
  institucionId: string,
  usuarioId: string,
  materiaId: string,
  ciclo: number,
  filas: NominaCursadaHibrida[],
): Promise<void> {
  const db = await abrirDb();
  const clave = claveParticion(institucionId, usuarioId, `${materiaId}:${ciclo}`);
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NOMINAS, "readwrite");
    tx.objectStore(STORE_NOMINAS).put({
      clave,
      institucionId,
      usuarioId,
      materiaId,
      ciclo,
      actualizadoEn: new Date(now).toISOString(),
      expiraEn: new Date(now + TTL_MS).toISOString(),
      filas,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function leerNominaLocal(
  institucionId: string,
  usuarioId: string,
  materiaId: string,
  ciclo: number,
): Promise<NominaCursadaHibrida[] | null> {
  const db = await abrirDb();
  const clave = claveParticion(institucionId, usuarioId, `${materiaId}:${ciclo}`);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOMINAS, "readonly");
    const req = tx.objectStore(STORE_NOMINAS).get(clave);
    req.onsuccess = () => {
      const row = req.result as { expiraEn: string; filas: NominaCursadaHibrida[] } | undefined;
      if (!row || new Date(row.expiraEn).getTime() < Date.now()) resolve(null);
      else resolve(row.filas);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function encolarLoteOffline(
  lote: Omit<LoteAsistenciaOffline, "clave" | "creadoEn" | "expiraEn" | "estado">,
): Promise<LoteAsistenciaOffline> {
  const db = await abrirDb();
  const now = Date.now();
  const completo: LoteAsistenciaOffline = {
    ...lote,
    clave: claveParticion(lote.institucionId, lote.usuarioId, `${lote.materiaId}:${lote.ciclo}:${lote.fecha}`),
    creadoEn: new Date(now).toISOString(),
    expiraEn: new Date(now + TTL_MS).toISOString(),
    estado: "PENDIENTE",
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, "readwrite");
    tx.objectStore(STORE_COLA).put(completo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return completo;
}

export async function listarColaParticion(
  institucionId: string,
  usuarioId: string,
): Promise<LoteAsistenciaOffline[]> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, "readonly");
    const req = tx.objectStore(STORE_COLA).getAll();
    req.onsuccess = () => {
      const todos = (req.result as LoteAsistenciaOffline[]) ?? [];
      resolve(todos.filter((item) => item.institucionId === institucionId && item.usuarioId === usuarioId));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function marcarConflictoLote(clave: string, error: string): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, "readwrite");
    const store = tx.objectStore(STORE_COLA);
    const req = store.get(clave);
    req.onsuccess = () => {
      const row = req.result as LoteAsistenciaOffline | undefined;
      if (row) store.put({ ...row, estado: "CONFLICTO", ultimoError: error });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function eliminarLoteCola(clave: string): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, "readwrite");
    tx.objectStore(STORE_COLA).delete(clave);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function limpiarDatosUsuarioLocal(usuarioId?: string): Promise<void> {
  const db = await abrirDb();
  for (const storeName of [STORE_NOMINAS, STORE_COLA]) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      if (!usuarioId) {
        store.clear();
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          for (const row of (req.result as Array<{ clave: string; usuarioId: string }>) ?? []) {
            if (row.usuarioId === usuarioId) store.delete(row.clave);
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
