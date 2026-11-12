import { NextRequest, NextResponse } from "next/server";
import { conexion } from "../../../../lib/supabase";
import { calcularSha256 } from "../../../../lib/ingesta/sha256";
import { parsearPadronDesdeBuffer, parsearPlanDesdeBuffer } from "../../../../lib/ingesta/parser-determinista";
import { extraerDocumentoConIA } from "../../../../lib/ingesta/extractor-ia";
import type { AlertaConsistencia, TipoIngesta } from "../../../../lib/ingesta/tipos";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(req: NextRequest) {
  const db = await conexion();
  if (!db) {
    return NextResponse.json({ error: "Conexión no configurada." }, { status: 500 });
  }

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const form = await req.formData();
  const institucionId = String(form.get("institucion") ?? "");
  const tipo = String(form.get("tipo") ?? "PADRON_ESTUDIANTES") as TipoIngesta;
  const file = form.get("archivo");

  if (!institucionId || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta indicar institución o adjuntar archivo." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo debe pesar entre 1 byte y 4 MB." },
      { status: 400 },
    );
  }

  // Verificar membresía + licencia activa del usuario para esta institución
  const { data: permiso } = await db.rpc("tiene_permiso_modulo", {
    p_institucion: institucionId,
    p_modulo: "secretaria",
    p_roles: ["direccion", "secretaria"],
  });
  if (!permiso) {
    return NextResponse.json({ error: "Sin permisos o licencia vencida para esta institución." }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = calcularSha256(buffer);
  const nombreLower = file.name.toLowerCase();

  // Verificar si este mismo archivo exacto ya fue importado previamente
  const { data: lotePrevio } = await db
    .from("ingestas_lotes")
    .select("id,creado_en,estado")
    .eq("institucion_id", institucionId)
    .eq("archivo_sha256", sha256)
    .maybeSingle();

  const alertasExtra: AlertaConsistencia[] = [];
  if (lotePrevio) {
    alertasExtra.push({
      nivel: "advertencia",
      mensaje: `Este archivo exacto (SHA-256 ${sha256.slice(0, 12)}…) ya fue procesado anteriormente. Si confirmás, se actualizará de forma idempotente.`,
    });
  }

  const esPlanilla = nombreLower.endsWith(".xlsx") || nombreLower.endsWith(".xls") || nombreLower.endsWith(".csv");
  const esWord = nombreLower.endsWith(".docx");
  const esPdfOImagen =
    nombreLower.endsWith(".pdf") ||
    nombreLower.endsWith(".png") ||
    nombreLower.endsWith(".jpg") ||
    nombreLower.endsWith(".jpeg");

  if (!esPlanilla && !esWord && !esPdfOImagen) {
    return NextResponse.json(
      { error: "Formato no soportado. Usá .xlsx, .xls, .csv, .docx, .pdf o imagen." },
      { status: 400 },
    );
  }

  if (esPlanilla) {
    if (tipo === "PADRON_ESTUDIANTES") {
      const { estudiantes, alertas } = parsearPadronDesdeBuffer(buffer);
      return NextResponse.json({
        ok: estudiantes.length > 0,
        archivoNombre: file.name,
        archivoSha256: sha256,
        tipo,
        carril: "DETERMINISTA",
        mensaje: estudiantes.length
          ? "Planilla analizada localmente. Revisá la vista previa antes de confirmar."
          : "No se pudieron leer estudiantes de la planilla.",
        alertas: [...alertasExtra, ...alertas],
        datosPadron: estudiantes,
      });
    }
    const { plan, alertas } = parsearPlanDesdeBuffer(buffer);
    return NextResponse.json({
      ok: Boolean(plan && plan.materias.length > 0),
      archivoNombre: file.name,
      archivoSha256: sha256,
      tipo: "PLAN_ESTUDIO",
      carril: "DETERMINISTA",
      mensaje: plan
        ? "Planilla de materias analizada localmente. Completá los datos de resolución y confirmá."
        : "No se pudieron extraer materias de la planilla.",
      alertas: [...alertasExtra, ...alertas],
      datosPlan: plan,
    });
  }

  // Carril PDF / Imagen / Word
  const mime = nombreLower.endsWith(".pdf")
    ? "application/pdf"
    : nombreLower.endsWith(".png")
      ? "image/png"
      : nombreLower.endsWith(".jpg") || nombreLower.endsWith(".jpeg")
        ? "image/jpeg"
        : file.type || "application/octet-stream";

  const iaRes = await extraerDocumentoConIA({
    buffer,
    mimeType: mime,
    tipo,
    esWordDocx: esWord,
  });

  return NextResponse.json({
    ok: iaRes.ok,
    archivoNombre: file.name,
    archivoSha256: sha256,
    tipo,
    carril: "IA_MULTIMODAL",
    mensaje: iaRes.mensaje,
    alertas: [...alertasExtra, ...iaRes.alertas],
    datosPlan: iaRes.datosPlan,
    datosPadron: iaRes.datosPadron,
  });
}
