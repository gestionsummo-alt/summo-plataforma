/** Contrato para un adaptador institucional. No recibe claves de producción. */
export type ContextoIntegracion = {
  institucionId: string;
  integracionId: string;
  alcance: "planificaciones:lectura";
};
export type PlanificacionPublicada = {
  id: string;
  materiaId: string;
  version: number;
  titulo: string;
};
export interface ConectorPlanificaciones {
  /** El adaptador deberá resolver el contexto desde una credencial verificada. */
  listar(contexto: ContextoIntegracion): Promise<PlanificacionPublicada[]>;
}
/** Evita que un consumidor sustituya la institución resuelta por el servidor. */
export function comprobarAlcance(
  contexto: ContextoIntegracion,
  institucionSolicitada: string,
): void {
  if (contexto.institucionId !== institucionSolicitada ||
      contexto.alcance !== "planificaciones:lectura") {
    throw new Error("INTEGRACION_FUERA_DE_ALCANCE");
  }
}
