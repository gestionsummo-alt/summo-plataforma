"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type EstadoVoz = "INACTIVO" | "ESCUCHANDO" | "PENSANDO" | "HABLANDO";

interface RespuestaCopiloto {
  respuestaVoz: string;
  accion: {
    tipo: "NAVEGAR" | "EXPLICAR_PASO" | "NINGUNA";
    ruta?: string;
    campoResaltar?: string;
  };
  sugerenciaSiguiente?: string;
}

export function CopilotoVoz() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const institucionId = searchParams?.get("institucion") ?? undefined;

  const [estado, setEstado] = useState<EstadoVoz>("INACTIVO");
  const [abierto, setAbierto] = useState(false);
  const [mensajeVoz, setMensajeVoz] = useState("");
  const [subtitulo, setSubtitulo] = useState<string | null>(null);
  const [errorSoporte, setErrorSoporte] = useState<string | null>(null);
  const [textoManual, setTextoManual] = useState("");

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Inicializar Web Speech API al montar
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "es-AR";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setEstado("ESCUCHANDO");
        setErrorSoporte(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript ?? "";
        if (transcript) {
          setMensajeVoz(transcript);
          void enviarConsulta(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("SpeechRecognition error:", event.error);
        if (event.error === "not-allowed") {
          setErrorSoporte("El micrófono está bloqueado en tu navegador. Podés escribir tu consulta abajo.");
        }
        setEstado("INACTIVO");
      };

      recognition.onend = () => {
        // Si no está procesando ni hablando, vuelve a inactivo
        setEstado((prev) => (prev === "ESCUCHANDO" ? "INACTIVO" : prev));
      };

      recognitionRef.current = recognition;
    } else {
      setErrorSoporte("Tu navegador no soporta captura de voz directa, pero podés escribirle al asistente.");
    }

    return () => {
      detenerVoz();
    };
  }, []);

  function detenerVoz() {
    try {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    } catch {}
    setEstado("INACTIVO");
  }

  function hablarTexto(texto: string, alTerminar?: () => void) {
    if (!synthRef.current) {
      setSubtitulo(texto);
      alTerminar?.();
      return;
    }

    synthRef.current.cancel();
    setSubtitulo(texto);
    setEstado("HABLANDO");

    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = "es-AR";
    utterance.rate = 0.95; // ritmo pausado para mayor claridad
    utterance.pitch = 1.0;

    // Buscar voz en español rioplatense o latinoamericano
    const voces = synthRef.current.getVoices();
    const vozElegida =
      voces.find((v) => v.lang === "es-AR") ||
      voces.find((v) => v.lang.startsWith("es-419")) ||
      voces.find((v) => v.lang.startsWith("es"));
    if (vozElegida) {
      utterance.voice = vozElegida;
    }

    utterance.onend = () => {
      setEstado("INACTIVO");
      alTerminar?.();
    };

    utterance.onerror = () => {
      setEstado("INACTIVO");
      alTerminar?.();
    };

    synthRef.current.speak(utterance);
  }

  async function enviarConsulta(consulta: string) {
    if (!consulta.trim()) return;
    setEstado("PENSANDO");
    detenerVoz();

    try {
      const res = await fetch("/api/asistente/voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: consulta,
          institucionId,
          rutaActual: pathname,
        }),
      });

      if (!res.ok) throw new Error("Error en servidor de voz");
      const datos: RespuestaCopiloto = await res.json();

      hablarTexto(datos.respuestaVoz, () => {
        // Si hay una acción de navegación, ejecutarla de forma fluida
        if (datos.accion?.tipo === "NAVEGAR" && datos.accion.ruta) {
          router.push(datos.accion.ruta);
        }
      });
    } catch (e) {
      console.error(e);
      hablarTexto("Disculpame, hubo una pequeña demora en la conexión. ¿Podés repetirme tu pedido?");
    }
  }

  function alternarEscucha() {
    setAbierto(true);
    if (estado === "ESCUCHANDO") {
      recognitionRef.current?.stop();
      setEstado("INACTIVO");
      return;
    }

    if (estado === "HABLANDO") {
      detenerVoz();
      return;
    }

    if (!recognitionRef.current) {
      setErrorSoporte("Micrófono no disponible en este dispositivo. Podés escribir tu consulta.");
      return;
    }

    try {
      detenerVoz();
      recognitionRef.current.start();
    } catch (err) {
      console.warn("No se pudo iniciar reconocimiento:", err);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 10,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* CUADRO FLOTANTE CONVERSACIONAL */}
      {abierto && (
        <div
          style={{
            width: "min(92vw, 380px)",
            background: "#ffffff",
            borderRadius: 16,
            border: "2px solid #06594f",
            boxShadow: "0 12px 32px rgba(6, 89, 79, 0.18)",
            padding: 16,
            display: "grid",
            gap: 12,
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {/* Cabecera */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background:
                    estado === "ESCUCHANDO"
                      ? "#2e7d32"
                      : estado === "PENSANDO"
                      ? "#f57c00"
                      : estado === "HABLANDO"
                      ? "#0288d1"
                      : "#9e9e9e",
                }}
              />
              <strong style={{ fontSize: "0.95rem", color: "#06594f" }}>Copiloto de Voz SUMMO</strong>
            </div>
            <button
              type="button"
              onClick={() => {
                detenerVoz();
                setAbierto(false);
              }}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "1.1rem",
                cursor: "pointer",
                color: "#757575",
                padding: "2px 6px",
              }}
              title="Cerrar asistente"
            >
              ✕
            </button>
          </div>

          {/* Subtítulo / Voz en tiempo real */}
          <div
            style={{
              background: "#f4f8f6",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: "0.9rem",
              lineHeight: 1.4,
              color: "#1c2b26",
              minHeight: 52,
              maxHeight: 120,
              overflowY: "auto",
            }}
          >
            {estado === "ESCUCHANDO" ? (
              <em style={{ color: "#2e7d32" }}>🎙️ Te escucho... decime qué necesitás resolver</em>
            ) : estado === "PENSANDO" ? (
              <em style={{ color: "#f57c00" }}>⏳ Procesando tu consulta con el sistema...</em>
            ) : subtitulo ? (
              <span>{subtitulo}</span>
            ) : (
              <span style={{ color: "#6b7280" }}>
                Tocá el micrófono y decime qué trámite querés hacer (ej: <em>&quot;Quiero matricular un alumno&quot;</em> o <em>&quot;Tengo que cargar notas de examen&quot;</em>).
              </span>
            )}
          </div>

          {/* Input de texto manual como alternativa inclusiva */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textoManual.trim()) {
                const t = textoManual;
                setTextoManual("");
                void enviarConsulta(t);
              }
            }}
            style={{ display: "flex", gap: 6, margin: 0, padding: 0, background: "transparent", border: "none" }}
          >
            <input
              type="text"
              placeholder="O escribí tu consulta acá..."
              value={textoManual}
              onChange={(e) => setTextoManual(e.target.value)}
              style={{
                flex: 1,
                fontSize: "0.85rem",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #c2d5cd",
              }}
            />
            <button
              type="submit"
              disabled={estado === "PENSANDO" || !textoManual.trim()}
              style={{
                fontSize: "0.85rem",
                padding: "8px 12px",
                background: "#06594f",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Enviar
            </button>
          </form>

          {/* Botones de acción rápida y silenciar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
            {estado === "HABLANDO" ? (
              <button
                type="button"
                onClick={detenerVoz}
                style={{
                  background: "#ffebee",
                  color: "#c62828",
                  border: "1px solid #ffcdd2",
                  borderRadius: 6,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                🔇 Silenciar voz
              </button>
            ) : (
              <span style={{ color: "#8b9490" }}>Español (Argentina) · Modo Guiado</span>
            )}

            <button
              type="button"
              onClick={alternarEscucha}
              style={{
                background: estado === "ESCUCHANDO" ? "#c62828" : "#06594f",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {estado === "ESCUCHANDO" ? "Detener micrófono" : "🎤 Hablar ahora"}
            </button>
          </div>

          {errorSoporte && (
            <small style={{ color: "#c62828", fontSize: "0.78rem" }}>{errorSoporte}</small>
          )}
        </div>
      )}

      {/* BOTÓN FLOTANTE PRINCIPAL (PÍLDORA / MICRÓFONO) */}
      <button
        type="button"
        onClick={alternarEscucha}
        aria-label="Abrir Asistente de Voz SUMMO"
        title="Asistente de voz guiado para SUMMO"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          background: estado === "ESCUCHANDO" ? "#2e7d32" : "#06594f",
          color: "#ffffff",
          border: "2px solid #ffffff",
          borderRadius: 999,
          boxShadow: "0 6px 20px rgba(6, 89, 79, 0.35)",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.95rem",
          transition: "transform 0.15s ease, background 0.2s ease",
          transform: estado === "ESCUCHANDO" ? "scale(1.05)" : "scale(1)",
        }}
      >
        <span style={{ fontSize: "1.25rem" }}>
          {estado === "ESCUCHANDO" ? "🔴" : estado === "PENSANDO" ? "⏳" : estado === "HABLANDO" ? "🔊" : "🎙️"}
        </span>
        <span>
          {estado === "ESCUCHANDO"
            ? "Escuchando..."
            : estado === "PENSANDO"
            ? "Pensando..."
            : estado === "HABLANDO"
            ? "Hablando..."
            : "Asistente de Voz"}
        </span>
      </button>
    </div>
  );
}
