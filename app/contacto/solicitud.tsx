"use client";
import {useState} from "react";
export default function Formulario({destino,tipo}:{destino:string|null;tipo?:string}) {
 const [aviso,setAviso]=useState("");
 return <form onSubmit={e=>{e.preventDefault(); if(!destino)return; const f=new FormData(e.currentTarget);
 const asunto=String(f.get("tipo"))+" · "+f.get("institucion");
 const cuerpo=["Institución: "+f.get("institucion"),"Contacto: "+f.get("nombre"),"Correo de respuesta: "+f.get("correo"),"",String(f.get("mensaje"))].join("\n");
 window.location.href="mailto:"+destino+"?subject="+encodeURIComponent(asunto)+"&body="+encodeURIComponent(cuerpo);
 setAviso("Completá el envío en tu aplicación de correo. Si no se abrió, escribinos directamente a "+destino+".");}}>
 <label>Institución<input name="institucion" required maxLength={120}/></label><label>Nombre de contacto<input name="nombre" required maxLength={100} autoComplete="name"/></label><label>Correo de respuesta<input type="email" name="correo" required maxLength={180} autoComplete="email"/></label><label>Motivo<select name="tipo" defaultValue={tipo==="cotizacion"?"Cotización":"Demostración"}><option>Demostración</option><option>Cotización</option><option>Condiciones del servicio</option></select></label>
 <label>¿Qué necesita gestionar la institución?<textarea name="mensaje" required maxLength={1200}/></label><small>Incluí solo datos de contacto institucional. El envío se completa desde tu aplicación de correo.</small>
 <button disabled={!destino}>Preparar correo</button><p role="status">{aviso || (!destino?"El canal comercial está pendiente de configuración.":"")}</p></form>
}
