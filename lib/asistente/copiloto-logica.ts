export interface RespuestaCopiloto {
  respuestaVoz: string;
  accion: {
    tipo: "NAVEGAR" | "EXPLICAR_PASO" | "NINGUNA";
    ruta?: string;
    campoResaltar?: string;
  };
  sugerenciaSiguiente?: string;
}

export function procesarConsultaVozHeuristica(
  mensaje: string,
  institucionId?: string
): RespuestaCopiloto {
  const m = (mensaje ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!m) {
    return {
      respuestaVoz: "No llegué a escucharte bien. ¿Podrías repetirme qué trámite necesitás hacer?",
      accion: { tipo: "NINGUNA" },
    };
  }

  const instQuery = institucionId ? `?institucion=${encodeURIComponent(institucionId)}` : "";

  if (
    m.includes("asistenc") ||
    m.includes("preceptor") ||
    m.includes("tomar lista") ||
    m.includes("falta") ||
    m.includes("presente")
  ) {
    return {
      respuestaVoz:
        "¡Dale, che! Te abro el módulo de Asistencias y Preceptoría. Quedate tranqui que podés marcar presentes y ausentes incluso si no tenés internet en el aula, y después se sincroniza solo.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/asistencia${instQuery}` },
      sugerenciaSiguiente: "¿Querés que busquemos la lista de alguna materia en particular?",
    };
  }

  if (
    m.includes("import") ||
    m.includes("subir") ||
    m.includes("documento") ||
    m.includes("excel") ||
    m.includes("pdf") ||
    m.includes("archivo") ||
    m.includes("resolucion")
  ) {
    return {
      respuestaVoz:
        "¡Mirá qué bueno! Te llevo al Importador de Documentos. Arrastrá tu PDF o planilla de Excel ahí y el sistema te extrae los datos al toque para que los revises.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/importar${instQuery}` },
      sugerenciaSiguiente: "¿Tenés un padrón de estudiantes o una resolución de plan de estudio?",
    };
  }

  if (
    m.includes("examen") ||
    m.includes("mesa") ||
    m.includes("acta") ||
    m.includes("nota") ||
    m.includes("final") ||
    m.includes("volante")
  ) {
    return {
      respuestaVoz:
        "Dale, te abro Mesas y Actas. Ahí podés cargar las notas provisionales en el acta volante y, cuando esté todo listo, emitir el acta definitiva con código QR.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/examenes${instQuery}` },
      sugerenciaSiguiente: "¿Querés cargar notas de una mesa o revisar actas anteriores?",
    };
  }

  if (
    m.includes("inscrib") ||
    m.includes("matr") ||
    m.includes("alumno") ||
    m.includes("estudiante") ||
    m.includes("secretar") ||
    m.includes("cursada")
  ) {
    return {
      respuestaVoz:
        "Tranqui, te llevo a Secretaría Académica. Ahí podés anotar al alumno con su número de DNI o habilitarle las materias del ciclo lectivo.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/secretaria${instQuery}` },
      sugerenciaSiguiente: "¿Querés matricular a un estudiante nuevo o habilitar una cursada?",
    };
  }

  if (
    m.includes("normativa") ||
    m.includes("regla") ||
    m.includes("correlativ") ||
    m.includes("plan") ||
    m.includes("calendario") ||
    m.includes("ram") ||
    m.includes("rai")
  ) {
    return {
      respuestaVoz:
        "Ahí te abro Normativas y Reglas Académicas. Podés chequear las correlativas, la escala de notas y el calendario escolar oficial de la provincia.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/normativa${instQuery}` },
      sugerenciaSiguiente: "¿Querés revisar correlatividades o el calendario escolar?",
    };
  }

  if (
    m.includes("planific") ||
    m.includes("programa") ||
    m.includes("docente") ||
    m.includes("propuesta")
  ) {
    return {
      respuestaVoz:
        "Dale, te abro Planificaciones Docentes. Acá los profes cargan sus programas y el equipo directivo los va revisando y aprobando.",
      accion: { tipo: "NAVEGAR", ruta: `/panel/planificaciones${instQuery}` },
      sugerenciaSiguiente: "¿Buscás una planificación para revisar?",
    };
  }

  return {
    respuestaVoz:
      "¡Hola! Soy tu asistente de SUMMO. Decime qué trámite necesitás resolver hoy: te puedo llevar a Asistencias, Secretaría, Mesas de Examen, Normativas o al Importador de documentos.",
    accion: { tipo: "NINGUNA" },
    sugerenciaSiguiente: "Por ejemplo: 'Quiero matricular un estudiante' o 'Tengo que tomar asistencia'.",
  };
}
