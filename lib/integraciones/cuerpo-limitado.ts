export class CuerpoGrandeError extends Error {}
/** Cuenta bytes mientras recibe: Content-Length no constituye un control de memoria. */
export async function leerCuerpoLimitado(request: Request, limite: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) { await reader.cancel(); throw new CuerpoGrandeError("CUERPO_GRANDE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}
