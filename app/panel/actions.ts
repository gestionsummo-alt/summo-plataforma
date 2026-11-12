"use server";

import { revalidatePath } from "next/cache";
import { conexion } from "../../lib/supabase";

export type ResultadoAccion = { ok: boolean; mensaje: string };

function traducirError(codeOrMsg: string): string {
  const mapa: Record<string, string> = {
    ACCESO_DENEGADO: "Tu rol o licencia activa no habilita esta operación en la institución seleccionada.",
    CUPO_LICENCIA_ALCANZADO: "Se alcanzó el máximo de estudiantes activos habilitado por la licencia.",
    DATOS_PERSONA_INVALIDOS: "Revisá el documento y el nombre completo del estudiante.",
    DATOS_PLAN_INVALIDOS: "Completá carrera, código de plan y resolución jurisdiccional.",
    DATOS_MATERIA_INVALIDOS: "Completá el código y el nombre de la unidad curricular.",
    FECHA_FUERA_DE_CURSADO: "La fecha está fuera del período de cursado configurado en el calendario institucional.",
    FECHA_EN_RECESO: "La fecha corresponde al receso escolar del calendario institucional.",
    TURNOS_INVALIDOS: "Revisá la estructura de los turnos de examen.",
    CORRELATIVA_CIRCULAR: "Una materia no puede ser correlativa de sí misma.",
    DATOS_PLANIFICACION_INVALIDOS: "El contenido de la planificación debe tener al menos 10 caracteres.",
    SOLO_DIRECCION_APRUEBA: "Solo Dirección o Secretaría pueden aprobar planificaciones.",
    DATOS_MESA_INVALIDOS: "El cierre de inscripción debe ser anterior a la fecha y hora de la mesa.",
    INSCRIPCION_CERRADA: "El plazo de inscripción para esta mesa ya cerró.",
    CORRELATIVAS_PENDIENTES: "El estudiante no cumple con las correlativas requeridas para rendir esta materia.",
    ACTA_DEFINITIVA_INMUTABLE: "Esta mesa ya tiene un acta definitiva cerrada e inmutable.",
    ACTA_VOLANTE_PREVIA_REQUERIDA: "Primero debés guardar al menos un acta volante para revisar antes de emitir la definitiva.",
    NOTA_FUERA_DE_ESCALA: "Una o más notas están fuera de la escala permitida por la regla.",
  };
  return mapa[codeOrMsg] ?? "No se pudo completar la operación. Revisá los datos e intentá nuevamente.";
}

export async function guardarCalendarioOficial(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };

  const institucion = String(form.get("institucion") ?? "");
  const ciclo = Number(form.get("ciclo"));
  const normativa = String(form.get("normativa") ?? "");
  const cursadoInicio = String(form.get("cursado_inicio") ?? "");
  const cursadoFin = String(form.get("cursado_fin") ?? "");
  const recesoInicio = String(form.get("receso_inicio") ?? "").trim() || null;
  const recesoFin = String(form.get("receso_fin") ?? "").trim() || null;
  const cierreAdmin = String(form.get("cierre_administrativo") ?? "");
  const turnosRaw = String(form.get("turnos_json") ?? "[]");

  let turnos: unknown = [];
  try {
    turnos = JSON.parse(turnosRaw);
  } catch {
    return { ok: false, mensaje: "El formato de turnos no es válido." };
  }

  const { error } = await db.rpc("registrar_calendario_institucional", {
    p_institucion: institucion,
    p_ciclo: ciclo,
    p_normativa: normativa,
    p_cursado_inicio: cursadoInicio,
    p_cursado_fin: cursadoFin,
    p_receso_inicio: recesoInicio,
    p_receso_fin: recesoFin,
    p_cierre_admin: cierreAdmin,
    p_turnos: turnos,
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/normativa");
  return { ok: true, mensaje: `Calendario ${ciclo} guardado y auditado.` };
}

export async function guardarReglaRam(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };

  const promocionRaw = String(form.get("promocion") ?? "").trim();
  const turnosRaw = String(form.get("turnos_vigencia") ?? "").trim();
  const justifRaw = String(form.get("asistencia_justificada_min") ?? "").trim();

  const { error } = await db.rpc("registrar_regla_normativa", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_plan: String(form.get("plan_id") ?? ""),
    p_vigente_desde: String(form.get("vigente_desde") ?? ""),
    p_fuente: String(form.get("fuente") ?? ""),
    p_nivel_tipo: String(form.get("nivel_tipo") ?? "TECNICO_SUPERIOR"),
    p_asistencia_min: Number(form.get("asistencia_min")),
    p_asistencia_justificada_min: justifRaw ? Number(justifRaw) : null,
    p_escala_min: Number(form.get("escala_min") ?? 1),
    p_escala_max: Number(form.get("escala_max") ?? 10),
    p_aprobacion: Number(form.get("aprobacion") ?? 6),
    p_promocion: promocionRaw ? Number(promocionRaw) : null,
    p_turnos_vigencia: turnosRaw ? Number(turnosRaw) : null,
    p_vigencia_unidad: String(form.get("vigencia_unidad") ?? "TURNOS"),
    p_admite_libre: form.get("admite_libre") === "si",
    p_peso_tardanza: Number(form.get("peso_tardanza") ?? 0.5),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/normativa");
  return { ok: true, mensaje: "Nueva versión de regla RAM/RAI registrada." };
}

export async function crearPlan(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("crear_plan_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_carrera: String(form.get("carrera") ?? ""),
    p_codigo: String(form.get("codigo") ?? ""),
    p_res_jurisdiccional: String(form.get("resolucion_jurisdiccional") ?? ""),
    p_res_nacional: String(form.get("resolucion_nacional") ?? "") || null,
    p_cohorte_desde: Number(form.get("cohorte_desde")),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/secretaria");
  revalidatePath("/panel/normativa");
  return { ok: true, mensaje: "Plan de estudio creado." };
}

export async function crearMateria(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("crear_materia_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_plan: String(form.get("plan_id") ?? ""),
    p_codigo: String(form.get("codigo") ?? ""),
    p_nombre: String(form.get("nombre") ?? ""),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/secretaria");
  return { ok: true, mensaje: "Unidad curricular creada." };
}

export async function matricularEstudiante(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("matricular_estudiante", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_documento: String(form.get("documento") ?? ""),
    p_nombre: String(form.get("nombre") ?? ""),
    p_plan: String(form.get("plan_id") ?? ""),
    p_cohorte: Number(form.get("cohorte")),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/secretaria");
  return { ok: true, mensaje: "Estudiante matriculado con control de licencia y auditoría." };
}

export async function inscribirCursada(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("inscribir_cursada_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_matricula: String(form.get("matricula_id") ?? ""),
    p_materia: String(form.get("materia_id") ?? ""),
    p_ciclo: Number(form.get("ciclo")),
    p_comision: String(form.get("comision") ?? "A"),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/secretaria");
  revalidatePath("/panel/asistencia");
  return { ok: true, mensaje: "Cursada habilitada para toma de asistencia y actas." };
}

export async function sincronizarAsistenciasServer(input: {
  institucionId: string;
  ciclo: number;
  fecha: string;
  origen: "ONLINE" | "PWA_OFFLINE" | "ESPEJO_PC";
  registros: Array<{ cursada_id: string; peso_falta: number; idempotency_key: string }>;
}): Promise<{ ok: boolean; mensaje: string; aplicados?: number; omitidos?: number }> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { data, error } = await db.rpc("sincronizar_asistencia_lote", {
    p_institucion: input.institucionId,
    p_ciclo: input.ciclo,
    p_fecha: input.fecha,
    p_origen: input.origen,
    p_registros: input.registros,
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/asistencia");
  const res = (data ?? {}) as { aplicados?: number; omitidos_idempotentes?: number };
  return {
    ok: true,
    aplicados: res.aplicados ?? 0,
    omitidos: res.omitidos_idempotentes ?? 0,
    mensaje: `Sincronizado (${res.aplicados ?? 0} aplicado/s, ${res.omitidos_idempotentes ?? 0} ya procesado/s).`,
  };
}

export async function registrarDocente(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("registrar_docente_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_documento: String(form.get("documento") ?? ""),
    p_nombre: String(form.get("nombre") ?? ""),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/planificaciones");
  revalidatePath("/panel/secretaria");
  return { ok: true, mensaje: "Docente registrado en el padrón institucional." };
}

export async function guardarPlanificacion(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("guardar_planificacion_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_materia: String(form.get("materia_id") ?? ""),
    p_docente: String(form.get("docente_id") ?? ""),
    p_contenido: String(form.get("contenido") ?? ""),
    p_estado: String(form.get("estado") ?? "BORRADOR"),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/planificaciones");
  return { ok: true, mensaje: "Nueva versión de planificación guardada." };
}

export async function agregarCorrelativa(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("agregar_correlativa_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_materia: String(form.get("materia_id") ?? ""),
    p_requisito: String(form.get("requisito_id") ?? ""),
    p_instancia: String(form.get("instancia") ?? "RENDIR"),
    p_condicion: String(form.get("condicion") ?? "APROBADA"),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/normativa");
  revalidatePath("/panel/examenes");
  return { ok: true, mensaje: "Correlativa registrada correctamente." };
}

export async function crearMesa(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const fechaLocal = String(form.get("fecha") ?? "");
  const cierreLocal = String(form.get("cierre") ?? "");
  const { error } = await db.rpc("crear_mesa_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_materia: String(form.get("materia_id") ?? ""),
    p_fecha: `${fechaLocal}:00-03:00`,
    p_cierre: `${cierreLocal}:00-03:00`,
    p_llamado: Number(form.get("llamado") ?? 1),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/examenes");
  return { ok: true, mensaje: "Mesa de examen habilitada." };
}

export async function inscribirExamen(form: FormData): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { error } = await db.rpc("inscribir_examen_institucional", {
    p_institucion: String(form.get("institucion") ?? ""),
    p_mesa: String(form.get("mesa_id") ?? ""),
    p_matricula: String(form.get("matricula_id") ?? ""),
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/examenes");
  return { ok: true, mensaje: "Estudiante inscripto en mesa (correlativas y plazo verificados)." };
}

export async function guardarActaExamen(input: {
  institucionId: string;
  mesaId: string;
  reglaId: string;
  referencia: string;
  cerrarDefinitiva: boolean;
  origen: "ONLINE" | "PWA_OFFLINE" | "ESPEJO_PC";
  resultados: Array<{ inscripcion_id: string; nota: number | null; condicion: "APROBADO" | "DESAPROBADO" | "AUSENTE" }>;
}): Promise<ResultadoAccion> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };
  const { data, error } = await db.rpc("guardar_acta_examen_hibrida", {
    p_institucion: input.institucionId,
    p_mesa: input.mesaId,
    p_regla: input.reglaId,
    p_referencia: input.referencia,
    p_cerrar_definitiva: input.cerrarDefinitiva,
    p_resultados: input.resultados,
    p_origen: input.origen,
  });
  if (error) return { ok: false, mensaje: traducirError(error.message) };
  revalidatePath("/panel/examenes");
  const info = (data ?? {}) as { tipo?: string; version?: number };
  return {
    ok: true,
    mensaje:
      info.tipo === "DEFINITIVA"
        ? `Acta DEFINITIVA v${info.version ?? 1} cerrada e inmutable.`
        : `Acta VOLANTE v${info.version ?? 1} guardada para revisión.`,
  };
}
