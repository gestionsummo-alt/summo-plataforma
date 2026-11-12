import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {conexion} from "../../lib/supabase";
import {modulos,type Modulo} from "../../lib/modulos";
export default async function Panel({searchParams}:{searchParams:Promise<{institucion?:string}>}){
 const db=await conexion(); if(!db)redirect("/acceso?estado=configuracion");
 const {data:{user}}=await db.auth.getUser(); if(!user)redirect("/acceso");
 const membresias=await db.from("membresias").select("institucion_id,rol,instituciones(nombre)").eq("usuario_id",user.id);
 if(membresias.error)throw new Error("No se pudieron consultar las instituciones");
 const opciones=membresias.data as unknown as {institucion_id:string;rol:string;instituciones:{nombre:string}}[];
 if(!opciones.length)return <p>Tu cuenta todavía no tiene una institución asignada.</p>;
 const id=(await searchParams).institucion??opciones[0].institucion_id;
 const activa=opciones.find(o=>o.institucion_id===id);if(!activa)notFound();
 const licencia=await db.from("licencias").select("max_estudiantes,modulos,vence").eq("institucion_id",id).maybeSingle();
 if(licencia.error)throw new Error("No se pudo consultar la licencia");
 const l=licencia.data;
 return <><nav aria-label="Seleccionar institución">{opciones.map(o=><Link key={o.institucion_id} aria-current={o===activa?"page":undefined} href={"/panel?institucion="+o.institucion_id}>{o.instituciones.nombre}</Link>)}</nav><h2>{activa.instituciones.nombre}</h2><p>Perfil de {activa.rol}</p>
 {l?<><p>Licencia para {l.max_estudiantes} estudiantes · Vencimiento {l.vence}</p><h3>Módulos contratados</h3><div className="grid">{(l.modulos as Modulo[]).map(m=><article key={m}><h3>{modulos[m][0]}</h3><p>{modulos[m][1]}</p></article>)}</div></>:<p>La institución aún no tiene una licencia asignada.</p>}</>;
}
