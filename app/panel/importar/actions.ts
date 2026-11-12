"use server";

import { revalidatePath } from "next/cache";
import { conexion } from "../../../lib/supabase";
import type { EstudianteFila, PlanEstudioExtraccion } from "../../../lib/ingesta/tipos";

export async function confirmarImportacionPadron(input: {
  institucionId: string;
  archivoNombre: string;
  archivoSha256: string;
  planId: string;
  cohorte: number;
  estudiantes: EstudianteFila[];
}): Promise<{ ok: boolean; mensaje: string }> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };

  const { data, error } = await db.rpc("importar_padron_estudiantes_lote", {
    p_institucion: input.institucionId,
    p_archivo_nombre: input.archivoNombre,
    p_archivo_sha256: input.archivoSha256,
    p_plan: input.planId,
    p_cohorte: input.cohorte,
    p_estudiantes: input.estudiantes,
  });

  if (error) {
    return {
      ok: false,
      mensaje: error.message.includes("CUPO_LICENCIA_ALCANZADO")
        ? error.message
        : "No se pudo confirmar el lote en la base de datos. Verificá los datos y tus permisos.",
    };
  }

  revalidatePath("/panel/secretaria");
  revalidatePath("/panel/importar");
  const res = (data ?? {}) as { importados?: number; actualizados?: number };
  return {
    ok: true,
    mensaje: `Lote confirmado e incorporado: ${res.importados ?? 0} matrícula(s) nueva(s) y ${res.actualizados ?? 0} ya existente(s) actualizadas.`,
  };
}

export async function confirmarImportacionPlan(input: {
  institucionId: string;
  archivoNombre: string;
  archivoSha256: string;
  plan: PlanEstudioExtraccion;
  incluirReglaDefault: boolean;
}): Promise<{ ok: boolean; mensaje: string }> {
  const db = await conexion();
  if (!db) return { ok: false, mensaje: "Falta configurar Supabase en el entorno." };

  const { data, error } = await db.rpc("importar_plan_estudio_lote", {
    p_institucion: input.institucionId,
    p_archivo_nombre: input.archivoNombre,
    p_archivo_sha256: input.archivoSha256,
    p_carrera: input.plan.carrera,
    p_codigo: input.plan.codigo,
    p_res_jurisdiccional: input.plan.resolucion_jurisdiccional,
    p_res_nacional: input.plan.resolucion_nacional ?? null,
    p_cohorte_desde: input.plan.cohorte_desde,
    p_materias: input.plan.materias,
    p_correlativas: input.plan.correlativas,
    p_regla: input.incluirReglaDefault
      ? {
          nivel_tipo: "TECNICO_SUPERIOR",
          asistencia_min: 75,
          asistencia_justificada_min: 60,
          aprobacion: 6,
          turnos_vigencia: 7,
          vigencia_unidad: "TURNOS",
          admite_libre: true,
        }
      : null,
  });

  if (error) {
    return {
      ok: false,
      mensaje: `No se pudo incorporar el plan de estudio (${error.message}).`,
    };
  }

  revalidatePath("/panel/secretaria");
  revalidatePath("/panel/normativa");
  revalidatePath("/panel/importar");
  const res = (data ?? {}) as { materias_creadas?: number; correlativas_creadas?: number };
  return {
    ok: true,
    mensaje: `Plan "${input.plan.carrera}" incorporado con éxito: ${res.materias_creadas ?? 0} materias y ${res.correlativas_creadas ?? 0} correlativas registradas.`,
  };
}
