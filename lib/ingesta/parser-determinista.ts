import * as XLSX from "xlsx";
import type {
  AlertaConsistencia,
  CorrelativaFila,
  EstudianteFila,
  MateriaPlanFila,
  PlanEstudioExtraccion,
} from "./tipos";

function normalizarTexto(txt: unknown): string {
  if (txt == null) return "";
  return String(txt).trim();
}

function limpiarClave(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function parsearPadronDesdeBuffer(buffer: Buffer): {
  estudiantes: EstudianteFila[];
  alertas: AlertaConsistencia[];
} {
  const alertas: AlertaConsistencia[] = [];
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      estudiantes: [],
      alertas: [{ nivel: "error", mensaje: "El archivo no contiene hojas con datos." }],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    return {
      estudiantes: [],
      alertas: [{ nivel: "error", mensaje: "La primera hoja del archivo está vacía." }],
    };
  }

  // Detectar nombres de columnas
  const encabezados = Object.keys(rows[0]);
  let colDoc: string | null = null;
  let colNom: string | null = null;
  let colApe: string | null = null;
  let colCohorte: string | null = null;

  for (const h of encabezados) {
    const k = limpiarClave(h);
    if (!colDoc && (k.includes("dni") || k.includes("documento") || k.includes("doc") || k.includes("cedula") || k === "id")) {
      colDoc = h;
    } else if (!colCohorte && (k.includes("cohorte") || k.includes("anioingreso") || k.includes("ciclo"))) {
      colCohorte = h;
    } else if (!colApe && (k.includes("apellido") || k.includes("apellidos"))) {
      colApe = h;
    } else if (!colNom && (k.includes("nombre") || k.includes("estudiante") || k.includes("alumno"))) {
      colNom = h;
    }
  }

  if (!colDoc) {
    // Si no encontró columna explícita, buscar por contenido (columna con números de 7-8 dígitos)
    for (const h of encabezados) {
      const valores = rows.slice(0, 10).map((r) => String(r[h] ?? "").replace(/[^0-9]/g, ""));
      const sonDnis = valores.filter((v) => v.length >= 7 && v.length <= 8).length;
      if (sonDnis >= 3) {
        colDoc = h;
        break;
      }
    }
  }

  if (!colDoc) {
    alertas.push({
      nivel: "error",
      mensaje: "No se identificó la columna de DNI o Documento. Verificá que exista un encabezado 'DNI' o 'Documento'.",
    });
    return { estudiantes: [], alertas };
  }

  const vistosDocs = new Map<string, number>();
  const estudiantes: EstudianteFila[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nroFila = i + 2; // +2 por encabezado y base 1
    const docCrudo = normalizarTexto(row[colDoc]);
    const docLimpio = docCrudo.replace(/[^0-9a-zA-Z]/g, "");

    let nombreFinal = "";
    if (colApe && colNom && colApe !== colNom) {
      const ape = normalizarTexto(row[colApe]);
      const nom = normalizarTexto(row[colNom]);
      nombreFinal = `${ape} ${nom}`.trim();
    } else if (colNom) {
      nombreFinal = normalizarTexto(row[colNom]);
    } else if (colApe) {
      nombreFinal = normalizarTexto(row[colApe]);
    } else {
      // Tomar primer columna con texto alfanumérico distinta del doc
      for (const h of encabezados) {
        if (h !== colDoc) {
          const val = normalizarTexto(row[h]);
          if (val.length >= 3 && !/^\d+$/.test(val)) {
            nombreFinal = val;
            break;
          }
        }
      }
    }

    if (!docLimpio) {
      alertas.push({
        nivel: "advertencia",
        fila: nroFila,
        campo: "documento",
        mensaje: `Fila ${nroFila} omitida: el campo documento está vacío.`,
      });
      continue;
    }

    if (docLimpio.length < 5 || docLimpio.length > 20) {
      alertas.push({
        nivel: "advertencia",
        fila: nroFila,
        campo: "documento",
        mensaje: `Documento inusual en fila ${nroFila}: '${docCrudo}'.`,
      });
    }

    if (!nombreFinal) {
      alertas.push({
        nivel: "advertencia",
        fila: nroFila,
        campo: "nombre",
        mensaje: `Fila ${nroFila}: el nombre está vacío. Se guardará provisoriamente como 'Estudiante Doc ${docLimpio}'.`,
      });
      nombreFinal = `Estudiante Doc ${docLimpio}`;
    }

    if (vistosDocs.has(docLimpio)) {
      alertas.push({
        nivel: "advertencia",
        fila: nroFila,
        campo: "documento",
        mensaje: `Documento duplicado '${docLimpio}' en fila ${nroFila} (ya aparecía en fila ${vistosDocs.get(docLimpio)}). Prevalecerá el último registro.`,
      });
    }
    vistosDocs.set(docLimpio, nroFila);

    const cohorteNum = colCohorte ? Number(String(row[colCohorte] ?? "").replace(/[^0-9]/g, "")) : undefined;

    estudiantes.push({
      documento: docLimpio,
      nombre: nombreFinal,
      cohorte: cohorteNum && cohorteNum >= 2000 && cohorteNum <= 2100 ? cohorteNum : undefined,
    });
  }

  if (estudiantes.length > 0) {
    alertas.push({
      nivel: "info",
      mensaje: `Lectura determinística exitosa: se procesaron ${estudiantes.length} estudiantes desde '${sheetName}'.`,
    });
  }

  return { estudiantes, alertas };
}

export function parsearPlanDesdeBuffer(buffer: Buffer): {
  plan?: PlanEstudioExtraccion;
  alertas: AlertaConsistencia[];
} {
  const alertas: AlertaConsistencia[] = [];
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { alertas: [{ nivel: "error", mensaje: "El archivo no contiene hojas." }] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rows.length === 0) {
    return { alertas: [{ nivel: "error", mensaje: "La planilla de materias está vacía." }] };
  }

  const encabezados = Object.keys(rows[0]);
  let colCod: string | null = null;
  let colNom: string | null = null;
  let colCorr: string | null = null;
  let colAnio: string | null = null;

  for (const h of encabezados) {
    const k = limpiarClave(h);
    if (!colCod && (k.includes("codigo") || k.includes("cod") || k.includes("idmateria"))) {
      colCod = h;
    } else if (!colNom && (k.includes("nombre") || k.includes("materia") || k.includes("asignatura") || k.includes("unidadcurricular"))) {
      colNom = h;
    } else if (!colCorr && (k.includes("correlativa") || k.includes("requisito") || k.includes("correlatividades"))) {
      colCorr = h;
    } else if (!colAnio && (k.includes("anio") || k.includes("cuatrimestre") || k.includes("periodo"))) {
      colAnio = h;
    }
  }

  if (!colNom) {
    alertas.push({ nivel: "error", mensaje: "No se identificó la columna con el nombre de las materias." });
    return { alertas };
  }

  const materias: MateriaPlanFila[] = [];
  const correlativas: CorrelativaFila[] = [];
  const vistosCodigos = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nroFila = i + 2;
    const nom = normalizarTexto(row[colNom]);
    if (!nom) continue;

    let cod = colCod ? normalizarTexto(row[colCod]).toUpperCase() : "";
    if (!cod) {
      // Generar código autoincremental si no vino en el Excel
      cod = `MAT-${String(i + 1).padStart(2, "0")}`;
    }

    if (vistosCodigos.has(cod)) {
      alertas.push({
        nivel: "error",
        fila: nroFila,
        campo: "codigo",
        mensaje: `Código duplicado '${cod}' en fila ${nroFila} ('${nom}'). Cada materia debe tener un código único.`,
      });
    }
    vistosCodigos.add(cod);

    const anio = colAnio ? normalizarTexto(row[colAnio]) : undefined;

    materias.push({
      codigo: cod,
      nombre: nom,
      anio_o_cuatrimestre: anio,
    });

    if (colCorr) {
      const corrTxt = normalizarTexto(row[colCorr]);
      if (corrTxt && corrTxt !== "-" && corrTxt !== "—") {
        const codigosReq = corrTxt.split(/[,;\n/]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        for (const req of codigosReq) {
          correlativas.push({
            materia_codigo: cod,
            requisito_codigo: req,
            instancia: "RENDIR",
            condicion: "APROBADA",
          });
        }
      }
    }
  }

  // Validar si las correlativas apuntan a códigos existentes
  for (const c of correlativas) {
    if (!vistosCodigos.has(c.requisito_codigo)) {
      alertas.push({
        nivel: "advertencia",
        campo: "correlativa",
        mensaje: `La materia '${c.materia_codigo}' tiene como requisito '${c.requisito_codigo}', que no figura entre los códigos de la lista.`,
      });
    }
  }

  const anioActual = new Date().getFullYear();
  const plan: PlanEstudioExtraccion = {
    carrera: `Carrera Importada (${sheetName})`,
    codigo: sheetName.slice(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "") || "PLAN-IMP",
    resolucion_jurisdiccional: "Res. a certificar por Secretaría",
    cohorte_desde: anioActual,
    materias,
    correlativas,
  };

  alertas.push({
    nivel: "info",
    mensaje: `Se leyeron ${materias.length} materias y ${correlativas.length} correlativas desde la planilla.`,
  });

  return { plan, alertas };
}
