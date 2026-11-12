import "server-only";
import { notFound, redirect } from "next/navigation";
import { conexion } from "./supabase";
import type { Modulo } from "./modulos";

export interface ContextoInstitucional {
  db: NonNullable<Awaited<ReturnType<typeof conexion>>>;
  userId: string;
  userEmail: string | null;
  institucionId: string;
  institucionNombre: string;
  jurisdiccion: string;
  rol: string;
  opciones: Array<{
    institucion_id: string;
    rol: string;
    instituciones: { nombre: string; jurisdiccion: string };
  }>;
  licencia: {
    max_estudiantes: number;
    modulos: Modulo[];
    vence: string;
  } | null;
}

export async function obtenerContextoInstitucional(
  institucionParam?: string,
  moduloRequerido?: Modulo,
): Promise<ContextoInstitucional> {
  const db = await conexion();
  if (!db) redirect("/acceso?estado=configuracion");
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/acceso");

  const membresias = await db
    .from("membresias")
    .select("institucion_id,rol,instituciones(nombre,jurisdiccion)")
    .eq("usuario_id", user.id);
  if (membresias.error) throw new Error("No se pudieron consultar las instituciones");

  const opciones = membresias.data as unknown as ContextoInstitucional["opciones"];
  if (!opciones.length) {
    redirect("/panel");
  }

  const id = institucionParam ?? opciones[0].institucion_id;
  const activa = opciones.find((o) => o.institucion_id === id);
  if (!activa) notFound();

  const licenciaRes = await db
    .from("licencias")
    .select("max_estudiantes,modulos,vence")
    .eq("institucion_id", id)
    .maybeSingle();
  if (licenciaRes.error) throw new Error("No se pudo consultar la licencia");

  const licencia = licenciaRes.data
    ? {
        max_estudiantes: licenciaRes.data.max_estudiantes as number,
        modulos: (licenciaRes.data.modulos as Modulo[]) ?? [],
        vence: licenciaRes.data.vence as string,
      }
    : null;

  if (moduloRequerido && (!licencia || !licencia.modulos.includes(moduloRequerido))) {
    redirect(`/panel?institucion=${encodeURIComponent(id)}`);
  }

  return {
    db,
    userId: user.id,
    userEmail: user.email ?? null,
    institucionId: id,
    institucionNombre: activa.instituciones.nombre,
    jurisdiccion: activa.instituciones.jurisdiccion,
    rol: activa.rol,
    opciones,
    licencia,
  };
}
