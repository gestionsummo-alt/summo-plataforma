"use server";
import {conexion} from "../../lib/supabase";
import {redirect} from "next/navigation";
export async function ingresar(form:FormData) {
 const db=await conexion();
 if(!db) redirect("/acceso?estado=configuracion");
 const email=String(form.get("correo")??"").trim(), password=String(form.get("clave")??"");
 const {error}=await db.auth.signInWithPassword({email,password});
 if(error) redirect("/acceso?estado=error");
 redirect("/panel");
}
export async function salir(){
 const db=await conexion();
 if(db){const {error}=await db.auth.signOut({scope:"local"});if(error) throw new Error("No se pudo cerrar la sesión.");}
 redirect("/");
}
