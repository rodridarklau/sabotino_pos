const { createHash } = require("node:crypto");

function validarDestinatario(valor) {
  if (typeof valor !== "string") return null;
  const direccion = valor.trim();
  if (direccion.length > 254 || !/^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(direccion)) return null;
  const [usuario, dominio] = direccion.split("@");
  if (usuario.length > 64 || dominio.split(".").some((parte) => parte.length > 63 || parte.startsWith("-") || parte.endsWith("-"))) return null;
  return `${usuario}@${dominio.toLowerCase()}`;
}

function estadoConfiguracion() {
  const clave = process.env.SABOTINO_RESEND_API_KEY?.trim();
  const remitente = process.env.SABOTINO_CORREO_REMITENTE?.trim();
  const direccion = remitente?.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] ?? remitente;
  return {
    clave: !clave ? "ausente" : /^re_[A-Za-z0-9_-]+$/.test(clave) ? "presente" : "formato inválido",
    remitente: !remitente ? "ausente" : validarDestinatario(direccion) ? "presente" : "formato inválido"
  };
}

function configurado() {
  return Object.values(estadoConfiguracion()).every((estado) => estado === "presente");
}

function claveEnvio(ventaId, destinatario, intento) {
  return "comprobante-" + createHash("sha256").update(JSON.stringify([ventaId, destinatario.toLowerCase(), intento ?? null])).digest("hex");
}

async function enviar(destinatario, contenido, clave) {
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SABOTINO_RESEND_API_KEY.trim()}`,
      "Content-Type": "application/json",
      "Idempotency-Key": clave
    },
    body: JSON.stringify({ ...contenido, from: process.env.SABOTINO_CORREO_REMITENTE.trim(), to: [destinatario] }),
    signal: AbortSignal.timeout(12000)
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || typeof datos?.id !== "string" || !datos.id) {
    throw Object.assign(new Error("Resend no confirmó el envío"), {
      estadoProveedor: respuesta.status, codigoProveedor: datos?.name
    });
  }
  return datos;
}

module.exports = { validarDestinatario, estadoConfiguracion, configurado, claveEnvio, enviar };
