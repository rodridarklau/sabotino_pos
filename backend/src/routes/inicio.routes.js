const express = require("express");
const { autorizar, nombreCajaPrincipal } = require("../services/caja-ventas");
const { consultarProcedimiento } = require("../config/procedimientos");
const router = express.Router();
const fechaSantiago = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit"
});

async function consultar(c, clave, procedimiento, binds) {
  try {
    return await consultarProcedimiento(c, procedimiento, binds);
  } catch (error) {
    console.error("Error consultando Inicio", clave, error.code);
    return null;
  }
}

router.get("/", (req, res) => {
  res.set("Cache-Control", "no-store");
  return autorizar(req, res, async (c, { actorId, dueno }) => {
    const partes = Object.fromEntries(fechaSantiago.formatToParts().map(({ type, value }) => [type, value]));
    const hoy = `${partes.year}-${partes.month}-${partes.day}`;
    const alcance = { actorId, dueno };
    const ventas = await consultar(c, "ventas", "SAB_API_INICIO_VENTAS", { hoy, ...alcance });
    const turnos = await consultar(c, "turnos", "SAB_API_INICIO_TURNOS", { actorId, nombre: nombreCajaPrincipal });
    const alertas = dueno ? await consultar(c, "stock", "SAB_API_ALERTAS_PRODUCTOS", { actorId }) : undefined;
    const alertasInsumos = dueno ? await consultar(c, "stock-insumos",
      "SAB_API_ALERTAS_INSUMOS", { actorId }) : undefined;
    res.json({ hoy, ventas: ventas?.[0] ?? null, turnos, alertas, alertasInsumos });
  });
});

module.exports = router;
