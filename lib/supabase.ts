import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function conexion() {
 const url = process.env.SUPABASE_URL;
 const key = process.env.SUPABASE_PUBLISHABLE_KEY;
 if (!url || !key) return null;
 const jar = await cookies();
 return createServerClient(url, key, {cookies:{
   getAll: () => jar.getAll(),
   setAll: valores => { try { for (const { name,value,options } of valores) jar.set(name,value,options); }
     catch { /* Los componentes de lectura no escriben cookies. */ } }
 }, global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store"})}});
}
