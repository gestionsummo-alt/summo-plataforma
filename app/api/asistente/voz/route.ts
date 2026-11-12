import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  procesarConsultaVozHeuristica,
  type RespuestaCopiloto,
} from "../../../../lib/asistente/copiloto-logica";

interface SolicitudVoz {
  mensaje: string;
  institucionId?: string;
  rutaActual?: string;
}

export async function POST(req: Request) {
  try {
    const cuerpo: SolicitudVoz = await req.json();
    const mensaje = (cuerpo.mensaje ?? "").trim();
    const institucionId = cuerpo.institucionId;

    if (!mensaje) {
      return NextResponse.json<RespuestaCopiloto>({
        respuestaVoz: "No llegué a escucharte bien. ¿Podrías repetirme qué trámite necesitás hacer?",
        accion: { tipo: "NINGUNA" },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey.includes("...")) {
      // Si la clave no está lista o tiene puntos, respondemos con el motor determinista de alta velocidad
      const r = procesarConsultaVozHeuristica(mensaje, institucionId);
      return NextResponse.json<RespuestaCopiloto>(r);
    }

    // Usar Gemini 3.8 Flash para comprensión conversacional profunda y empatía pedagógica
    try {
      const ai = new GoogleGenAI({ apiKey });
      const promptSistema = `Sos el Asistente de Voz y Copiloto Operativo de SUMMO (Tecnología híbrida de gestión educativa para Argentina).
Tu usuario es personal administrativo, preceptor o docente de un Instituto Superior o Técnico de Argentina (especialmente en Misiones y la región del Litoral / NEA).
Tu personalidad es la de un compañero de secretaría experimentado, paciente, cálido, amigable y muy pedagógico.
Hablás con acento y tono argentino auténtico, con voseo cotidiano y modismos naturales del Litoral/NEA (por ejemplo: "¡Dale, che!", "Mirá", "Quedate tranqui", "Ahí te abro", "Al toque").
Tus respuestas van a ser LEÍDAS EN VOZ ALTA por un sintetizador:
- Frases cortas, directas y fluidas.
- Ritmo hablado, cercano y tranquilizador.
- De no más de 2 o 3 oraciones breves.
- Cero tecnicismos y CERO formato Markdown (no uses asteriscos, guiones ni viñetas).

Catálogo de módulos de SUMMO para la acción NAVEGAR:
- /panel/secretaria: Planes de estudio, materias, matriculación por DNI, habilitación de cursadas del ciclo lectivo, cupo de licencia.
- /panel/importar: Ingesta con IA y planillas Excel/PDF de padrones de estudiantes, resoluciones de diseño curricular y normativas.
- /panel/asistencia: Registro diario de asistencia y preceptoría offline-first PWA con sincronización automática.
- /panel/examenes: Mesas de examen, correlativas, actas volantes provisorias y actas definitivas QR.
- /panel/normativa: Calendario oficial jurisdiccional, RAM/RAI, correlatividades (cursar regular vs rendir aprobada).
- /panel/planificaciones: Propuestas pedagógicas docentes y revisión institucional.
- /panel: Menú principal de la institución.

Si el usuario pregunta algo general, guialo con calidez litoraleña y ofrecé llevarlo a la sección correspondiente.`;

      const schema = {
        type: "object",
        properties: {
          respuestaVoz: {
            type: "string",
            description: "Texto hablado natural, tranquilizador y sin markdown para sintetizar en voz.",
          },
          accion: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["NAVEGAR", "EXPLICAR_PASO", "NINGUNA"] },
              ruta: { type: "string", description: "Ruta del módulo al que se navega, por ejemplo /panel/secretaria" },
              campoResaltar: { type: "string", description: "ID o clase del campo o botón a iluminar en pantalla si aplica" },
            },
            required: ["tipo"],
          },
          sugerenciaSiguiente: {
            type: "string",
            description: "Pregunta corta de continuación para guiar al usuario en el siguiente paso.",
          },
        },
        required: ["respuestaVoz", "accion"],
      };

      let texto = "";
      const modelos = ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-2.0-flash"];

      for (const modelo of modelos) {
        try {
          const res = await ai.models.generateContent({
            model: modelo,
            contents: [
              { role: "user", parts: [{ text: `${promptSistema}\n\nInstitución actual ID: ${institucionId ?? "ninguna"}\nMensaje del usuario: "${mensaje}"` }] },
            ],
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: schema,
            },
          });
          texto = res.text?.trim() ?? "";
          if (texto) break;
        } catch (errModelo) {
          console.warn(`Voz falló con modelo ${modelo}, intentando siguiente...`);
        }
      }

      if (!texto) {
        throw new Error("Ningún modelo generó respuesta");
      }

      const parsed = JSON.parse(texto) as RespuestaCopiloto;

      // Asegurar parámetro institucion en la ruta de navegación si aplica
      if (parsed.accion.ruta && institucionId && !parsed.accion.ruta.includes("institucion=")) {
        const sep = parsed.accion.ruta.includes("?") ? "&" : "?";
        parsed.accion.ruta = `${parsed.accion.ruta}${sep}institucion=${encodeURIComponent(institucionId)}`;
      }

      return NextResponse.json<RespuestaCopiloto>(parsed);
    } catch (errApi) {
      console.warn("Fallo temporal en Gemini API, activando fallback heurístico:", errApi);
      const r = procesarConsultaVozHeuristica(mensaje, institucionId);
      return NextResponse.json<RespuestaCopiloto>(r);
    }
  } catch (error) {
    console.error("Error en copiloto de voz:", error);
    return NextResponse.json<RespuestaCopiloto>(
      {
        respuestaVoz: "Hubo una interrupción en la comunicación. Pero podés seguir operando manualmente desde el menú.",
        accion: { tipo: "NINGUNA" },
      },
      { status: 500 }
    );
  }
}
