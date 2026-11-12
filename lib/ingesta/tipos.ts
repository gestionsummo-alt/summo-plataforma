export type TipoIngesta =
  | "PADRON_ESTUDIANTES"
  | "PLAN_ESTUDIO"
  | "CALENDARIO_JURISDICCIONAL";

export interface EstudianteFila {
  documento: string;
  nombre: string;
  cohorte?: number;
}

export interface MateriaPlanFila {
  codigo: string;
  nombre: string;
  anio_o_cuatrimestre?: string;
}

export interface CorrelativaFila {
  materia_codigo: string;
  requisito_codigo: string;
  instancia: "CURSAR" | "RENDIR";
  condicion: "REGULAR" | "APROBADA";
}

export interface PlanEstudioExtraccion {
  carrera: string;
  codigo: string;
  resolucion_jurisdiccional: string;
  resolucion_nacional?: string;
  cohorte_desde: number;
  materias: MateriaPlanFila[];
  correlativas: CorrelativaFila[];
}

export interface AlertaConsistencia {
  nivel: "error" | "advertencia" | "info";
  fila?: number;
  campo?: string;
  mensaje: string;
}

export interface ResultadoAnalisisDocumento {
  ok: boolean;
  archivoNombre: string;
  archivoSha256: string;
  tipo: TipoIngesta;
  carril: "DETERMINISTA" | "IA_MULTIMODAL";
  alertas: AlertaConsistencia[];
  mensaje: string;
  datosPadron?: EstudianteFila[];
  datosPlan?: PlanEstudioExtraccion;
}
