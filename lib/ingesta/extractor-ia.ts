import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import type {
  AlertaConsistencia,
  EstudianteFila,
  PlanEstudioExtraccion,
  TipoIngesta,
} from "./tipos";

const SCHEMA_PLAN_ESTUDIO = {
  type: "object",
  properties: {
    carrera: { type: "string", description: "Nombre completo de la carrera o tecnicatura" },
    codigo: { type: "string", description: "Sigla o código corto sugerido de la carrera (ej: TSDS)" },
    resolucion_jurisdiccional: { type: "string", description: "Número de resolución provincial/jurisdiccional de creación o aprobación" },
    resolucion_nacional: { type: "string", description: "Número de resolución nacional / validez nacional si aparece (puede ser vacío)" },
    cohorte_desde: { type: "integer", description: "Año de inicio de cohorte o vigencia del plan (ej: 2026)" },
    materias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          codigo: { type: "string", description: "Código de materia o asignatura (si no tiene, generar uno corto consistente ej MAT-101)" },
          nombre: { type: "string", description: "Nombre oficial de la unidad curricular / materia" },
          anio_o_cuatrimestre: { type: "string", description: "Año o cuatrimestre al que pertenece (ej: 1º Año - 1º Cuatrimestre)" },
        },
        required: ["codigo", "nombre"],
      },
    },
    correlativas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          materia_codigo: { type: "string", description: "Código de la materia objetivo" },
          requisito_codigo: { type: "string", description: "Código de la materia requisito previo" },
          instancia: { type: "string", enum: ["CURSAR", "RENDIR"], description: "Si el requisito aplica para CURSAR o para RENDIR examen final" },
          condicion: { type: "string", enum: ["REGULAR", "APROBADA"], description: "Condición requerida de la materia previa" },
        },
        required: ["materia_codigo", "requisito_codigo", "instancia", "condicion"],
      },
    },
  },
  required: ["carrera", "codigo", "resolucion_jurisdiccional", "cohorte_desde", "materias", "correlativas"],
};

const SCHEMA_PADRON_ESTUDIANTES = {
  type: "object",
  properties: {
    estudiantes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          documento: { type: "string", description: "Número de DNI o documento sin puntos ni espacios" },
          nombre: { type: "string", description: "Apellido y nombre completo del estudiante" },
          cohorte: { type: "integer", description: "Año de ingreso / cohorte si está indicado" },
        },
        required: ["documento", "nombre"],
      },
    },
  },
  required: ["estudiantes"],
};

export function validarConsistenciaPlan(plan: PlanEstudioExtraccion): AlertaConsistencia[] {
  const alertas: AlertaConsistencia[] = [];
  const codigos = new Set<string>();

  if (!plan.resolucion_jurisdiccional || plan.resolucion_jurisdiccional.trim().length < 3) {
    alertas.push({
      nivel: "advertencia",
      campo: "resolucion_jurisdiccional",
      mensaje: "No se detectó número claro de resolución jurisdiccional. Completalo antes de confirmar.",
    });
  }

  for (let i = 0; i < plan.materias.length; i++) {
    const m = plan.materias[i];
    const cod = (m.codigo ?? "").trim().toUpperCase();
    m.codigo = cod || `MAT-${String(i + 1).padStart(2, "0")}`;
    if (codigos.has(m.codigo)) {
      alertas.push({
        nivel: "error",
        fila: i + 1,
        campo: "codigo",
        mensaje: `Código de materia duplicado '${m.codigo}' (${m.nombre}). Corregilo en la tabla antes de importar.`,
      });
    }
    codigos.add(m.codigo);
  }

  for (const c of plan.correlativas) {
    c.materia_codigo = (c.materia_codigo ?? "").trim().toUpperCase();
    c.requisito_codigo = (c.requisito_codigo ?? "").trim().toUpperCase();
    if (!codigos.has(c.materia_codigo) || !codigos.has(c.requisito_codigo)) {
      alertas.push({
        nivel: "advertencia",
        campo: "correlativas",
        mensaje: `Correlativa '${c.materia_codigo} ← ${c.requisito_codigo}' referencia un código que no coincide exactamente con la tabla de materias.`,
      });
    }
    if (c.materia_codigo === c.requisito_codigo) {
      alertas.push({
        nivel: "error",
        campo: "correlativas",
        mensaje: `Correlativa circular detectada en '${c.materia_codigo}'.`,
      });
    }
  }

  alertas.push({
    nivel: "info",
    mensaje: `Extracción lista para revisión: ${plan.materias.length} unidades curriculares y ${plan.correlativas.length} correlativas detectadas.`,
  });

  return alertas;
}

export function extraerPadronDesdeTextoPlano(texto: string): EstudianteFila[] {
  const filas: EstudianteFila[] = [];
  const lineas = texto.split(/\r?\n/);
  for (const l of lineas) {
    const m = l.match(/(\d[\d.]{5,9}\d)\s*[-–|;,\t ]+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ,.-]{4,80})/);
    if (m) {
      const documento = m[1].replace(/\D/g, "");
      const nombre = m[2].trim().replace(/\s+/g, " ");
      if (documento.length >= 6 && nombre.length >= 3) {
        filas.push({ documento, nombre });
      }
    }
  }
  return filas;
}

export async function extraerDocumentoConIA(params: {
  buffer: Buffer;
  mimeType: string;
  tipo: TipoIngesta;
  esWordDocx?: boolean;
}): Promise<{
  ok: boolean;
  mensaje: string;
  alertas: AlertaConsistencia[];
  datosPlan?: PlanEstudioExtraccion;
  datosPadron?: EstudianteFila[];
}> {
  let textoWord: string | null = null;
  if (params.esWordDocx) {
    const resWord = await mammoth.extractRawText({ buffer: params.buffer });
    textoWord = resWord.value ?? "";
    if (!process.env.GEMINI_API_KEY && params.tipo === "PADRON_ESTUDIANTES") {
      const filas = extraerPadronDesdeTextoPlano(textoWord);
      if (filas.length > 0) {
        return {
          ok: true,
          mensaje: `Se extrajeron ${filas.length} estudiantes desde el documento Word de forma determinística.`,
          alertas: [
            {
              nivel: "info",
              mensaje: `Word procesado localmente sin IA externa: ${filas.length} registros detectados.`,
            },
          ],
          datosPadron: filas,
        };
      }
    }
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      mensaje:
        "Para leer PDFs escaneados o resoluciones con IA necesitás configurar GEMINI_API_KEY en el entorno (.env.local / Vercel). Los archivos Excel (.xlsx) y CSV funcionan siempre sin clave de IA.",
      alertas: [
        {
          nivel: "error",
          mensaje: "Falta configurar GEMINI_API_KEY en el servidor para habilitar el lector multimodal de PDF/Word.",
        },
      ],
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  const schema = params.tipo === "PLAN_ESTUDIO" ? SCHEMA_PLAN_ESTUDIO : SCHEMA_PADRON_ESTUDIANTES;
  const prompt =
    params.tipo === "PLAN_ESTUDIO"
      ? "Analizá este documento oficial de Educación Superior de Argentina (resolución o diseño curricular). Extraé con total exactitud la denominación de la carrera, el número de resolución jurisdiccional y nacional si consta, el año de cohorte inicial, TODAS las unidades curriculares (materias, talleres, seminarios, prácticas) y TODAS las correlatividades (para CURSAR o RENDIR en condición REGULAR o APROBADA). No inventes materias que no aparezcan en el documento."
      : "Analizá este listado o planilla institucional y extraé cada estudiante con su número de documento (solo dígitos) y su apellido y nombre completo. No inventes ni modifiques documentos.";

  const contents =
    textoWord !== null
      ? [{ text: `${prompt}\n\nCONTENIDO DEL DOCUMENTO WORD:\n${textoWord.slice(0, 120000)}` }]
      : [
          { text: prompt },
          {
            inlineData: {
              mimeType: params.mimeType || "application/pdf",
              data: params.buffer.toString("base64"),
            },
          },
        ];

  let rawText = "";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
    rawText = response.text ?? "";
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error("Error en extracción multimodal Gemini:", errorMsg);
    let detalle = "No se pudo procesar el documento con el motor de IA.";
    if (errorMsg.includes("API key not valid") || errorMsg.includes("API_KEY_INVALID")) {
      detalle =
        "La clave GEMINI_API_KEY no es válida o contiene puntos suspensivos (...). Verificá haber copiado la clave completa desde Google AI Studio (aistudio.google.com/api-keys).";
    } else if (errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      detalle = "Límite de cuota gratuita alcanzado temporalmente. Aguardá 60 segundos antes de reintentar.";
    }
    return {
      ok: false,
      mensaje: detalle,
      alertas: [{ nivel: "error", mensaje: detalle }],
    };
  }

  if (!rawText) {
    return {
      ok: false,
      mensaje: "El motor de lectura no devolvió contenido estructurado para este documento.",
      alertas: [{ nivel: "error", mensaje: "Respuesta vacía del extractor." }],
    };
  }

  const parsed = JSON.parse(rawText);

  if (params.tipo === "PLAN_ESTUDIO") {
    const plan: PlanEstudioExtraccion = {
      carrera: String(parsed.carrera ?? "Carrera extraída"),
      codigo: String(parsed.codigo ?? "PLAN").toUpperCase(),
      resolucion_jurisdiccional: String(parsed.resolucion_jurisdiccional ?? ""),
      resolucion_nacional: parsed.resolucion_nacional ? String(parsed.resolucion_nacional) : undefined,
      cohorte_desde: Number(parsed.cohorte_desde) || new Date().getFullYear(),
      materias: Array.isArray(parsed.materias) ? parsed.materias : [],
      correlativas: Array.isArray(parsed.correlativas) ? parsed.correlativas : [],
    };
    const alertas = validarConsistenciaPlan(plan);
    return {
      ok: true,
      mensaje: "Diseño curricular extraído. Revisá y editá cualquier fila en la vista previa antes de confirmar.",
      alertas,
      datosPlan: plan,
    };
  }

  const estudiantes: EstudianteFila[] = Array.isArray(parsed.estudiantes)
    ? parsed.estudiantes.map((e: { documento?: unknown; nombre?: unknown; cohorte?: unknown }) => ({
        documento: String(e.documento ?? "").replace(/[^0-9a-zA-Z]/g, ""),
        nombre: String(e.nombre ?? "").trim(),
        cohorte: e.cohorte ? Number(e.cohorte) : undefined,
      }))
    : [];

  return {
    ok: true,
    mensaje: `Se extrajeron ${estudiantes.length} estudiantes del documento. Verificá los DNIs en la vista previa.`,
    alertas: [
      {
        nivel: "info",
        mensaje: `Lectura asistida completada: ${estudiantes.length} registros listos para revisión humana.`,
      },
    ],
    datosPadron: estudiantes,
  };
}
