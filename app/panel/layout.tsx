import { redirect } from "next/navigation";
import { conexion } from "../../lib/supabase";
import { BotonSalir } from "./boton-salir";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const db = await conexion();
  if (!db) redirect("/acceso?estado=configuracion");
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/acceso");
  return (
    <main>
      <div className="lic">
        <div>
          <p className="eyebrow">Administración institucional</p>
          <h1>Panel de gestión</h1>
        </div>
        <BotonSalir usuarioId={user.id} />
      </div>
      {children}
    </main>
  );
}
