import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { conexion } from "../../lib/supabase";
import { modulos, type Modulo } from "../../lib/modulos";

const rutasModulo: Partial<Record<Modulo, string>> = {
  normativa: "/panel/normativa",
  secretaria: "/panel/secretaria",
  asistencia: "/panel/asistencia",
};

export default async function Panel({
  searchParams,
}: {
  searchParams: Promise<{ institucion?: string }>;
}) {
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

  const opciones = membresias.data as unknown as {
    institucion_id: string;
    rol: string;
    instituciones: { nombre: string; jurisdiccion: string };
  }[];
  if (!opciones.length) {
    return (
      <article>
        <h2>Cuenta autenticada sin institución asignada</h2>
        <p>
          Tu usuario (<code>{user.email}</code> · ID <code>{user.id}</code>) ya existe en Supabase Auth,
          pero todavía no está vinculado a ninguna institución en <code>public.membresias</code>.
        </p>
        <p>
          Para pruebas piloto con datos sintéticos, ejecutá{" "}
          <code>supabase/seeds/piloto_sintetico.sql</code> reemplazando el UUID con tu ID de usuario.
        </p>
      </article>
    );
  }

  const id = (await searchParams).institucion ?? opciones[0].institucion_id;
  const activa = opciones.find((o) => o.institucion_id === id);
  if (!activa) notFound();

  const licencia = await db
    .from("licencias")
    .select("max_estudiantes,modulos,vence")
    .eq("institucion_id", id)
    .maybeSingle();
  if (licencia.error) throw new Error("No se pudo consultar la licencia");
  const l = licencia.data;

  return (
    <>
      <nav aria-label="Seleccionar institución" style={{ marginBottom: 18 }}>
        {opciones.map((o) => (
          <Link
            key={o.institucion_id}
            aria-current={o === activa ? "page" : undefined}
            className="access"
            href={"/panel?institucion=" + encodeURIComponent(o.institucion_id)}
          >
            {o.instituciones.nombre} ({o.instituciones.jurisdiccion})
          </Link>
        ))}
      </nav>
      <h2>{activa.instituciones.nombre}</h2>
      <p>
        Jurisdicción: <strong>{activa.instituciones.jurisdiccion}</strong> · Perfil de{" "}
        <strong>{activa.rol}</strong>
      </p>
      {l ? (
        <>
          <p>
            Licencia para <strong>{l.max_estudiantes}</strong> estudiantes activos · Vencimiento{" "}
            <strong>{l.vence}</strong>
          </p>
          <h3>Módulos contratados</h3>
          <div className="grid">
            {(l.modulos as Modulo[]).map((m) => {
              const ruta = rutasModulo[m];
              return (
                <article key={m}>
                  <h3>{modulos[m][0]}</h3>
                  <p>{modulos[m][1]}</p>
                  {ruta ? (
                    <Link className="boton" href={`${ruta}?institucion=${encodeURIComponent(id)}`}>
                      Abrir módulo →
                    </Link>
                  ) : (
                    <small>Planificado para próxima etapa del roadmap</small>
                  )}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <p>La institución aún no tiene una licencia asignada.</p>
      )}
    </>
  );
}
