/** Adaptación del cálculo por clases dictadas. Cada valor proviene de una marca documentada. */
export function porcentajeAsistencia(clasesDictadas:number,pesosDeFalta:number[]):number|null {
 if(!Number.isInteger(clasesDictadas) || clasesDictadas<1 || pesosDeFalta.length!==clasesDictadas) return null;
 if(pesosDeFalta.some(p=>!Number.isFinite(p)||p<0||p>1)) throw new Error("Peso de falta fuera de escala");
 const faltas=pesosDeFalta.reduce((total,peso)=>total+peso,0);
 return Math.round((1-faltas/clasesDictadas)*10000)/100;
}
