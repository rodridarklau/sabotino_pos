const express = require("express");
const { autorizar, filas } = require("../services/caja-ventas");
const { alertasStockSql } = require("../services/alertas-stock");

const router = express.Router();
const fechaSantiago = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit"
});

async function consultar(c, clave, sql, binds) {
  try {
    return await filas(c, sql, binds);
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
    const ventas = await consultar(c, "ventas", `SELECT COUNT(*) AS CANTIDAD,
        NVL(SUM(V.TOTAL_VENTA), 0) AS TOTAL
      FROM VENTA V WHERE V.ESTADO_VENTA = 'CONFIRMADA'
        AND V.FECHA_HORA_VENTA >= TO_TIMESTAMP(:hoy, 'YYYY-MM-DD')
        AND V.FECHA_HORA_VENTA < TO_TIMESTAMP(:hoy, 'YYYY-MM-DD') + INTERVAL '1' DAY
        AND (:dueno = 1 OR V.ID_USUARIO = :actorId)`, { hoy, ...alcance });
    const turnos = await consultar(c, "turnos", `SELECT T.ID_TURNO_CAJA, C.NOMBRE_CAJA,
        TO_CHAR(T.FECHA_HORA_APERTURA, 'HH24:MI DD/MM/YYYY') AS APERTURA
      FROM TURNO_CAJA T JOIN CAJA_TERMINAL C ON C.ID_CAJA = T.ID_CAJA
      WHERE T.ESTADO_TURNO = 'ABIERTO' AND (:dueno = 1 OR T.ID_USUARIO_APERTURA = :actorId)
      ORDER BY T.FECHA_HORA_APERTURA DESC, T.ID_TURNO_CAJA DESC`, alcance);
    const alertas = dueno ? await consultar(c, "stock", alertasStockSql) : undefined;
    res.json({ hoy, ventas: ventas?.[0] ?? null, turnos, alertas });
  });
});

module.exports = router;
