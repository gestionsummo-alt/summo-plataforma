/**
 * Motor de fusión granular de actas volantes para tecnología híbrida SUMMO.
 * Combina notas o condiciones cargadas sin conexión con un borrador volante más
 * reciente sin sobrescribir cambios ajenos que no fueron modificados en local.
 */

export interface ResultadoActaItem {
  inscripcion_id: string;
  nota: number | null;
  condicion: "APROBADO" | "DESAPROBADO" | "AUSENTE";
}

export function evaluarCondicionExamen(
  nota: number | null,
  esAusente: boolean,
  aprobacionMinima: number,
): ResultadoActaItem["condicion"] {
  if (esAusente || nota === null) return "AUSENTE";
  return nota >= aprobacionMinima ? "APROBADO" : "DESAPROBADO";
}

export function fusionarActaVolante(
  local: ResultadoActaItem[],
  remoto: ResultadoActaItem[],
  basePrevia: Record<string, ResultadoActaItem>,
): { fusionado: ResultadoActaItem[]; conflictos: string[] } {
  const mapaRemoto = new Map(remoto.map((r) => [r.inscripcion_id, r]));
  const conflictos: string[] = [];

  const fusionado = local.map((item) => {
    const rem = mapaRemoto.get(item.inscripcion_id);
    const base = basePrevia[item.inscripcion_id];
    if (!rem) return item;

    const localCambio = !base || base.nota !== item.nota || base.condicion !== item.condicion;
    const remotoCambio = !base || base.nota !== rem.nota || base.condicion !== rem.condicion;

    if (localCambio && remotoCambio && (item.nota !== rem.nota || item.condicion !== rem.condicion)) {
      conflictos.push(item.inscripcion_id);
      return item;
    }
    if (!localCambio && remotoCambio) {
      return rem;
    }
    return item;
  });

  return { fusionado, conflictos };
}
