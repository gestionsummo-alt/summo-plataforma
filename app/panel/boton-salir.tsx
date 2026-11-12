"use client";

import { limpiarDatosUsuarioLocal } from "../../lib/hibrido/cola-indexeddb";
import { salir } from "../acceso/actions";

export function BotonSalir({ usuarioId }: { usuarioId: string }) {
  return (
    <form
      action={salir}
      onSubmit={() => {
        void limpiarDatosUsuarioLocal(usuarioId).catch(() => {});
      }}
    >
      <button type="submit">Cerrar sesión</button>
    </form>
  );
}
