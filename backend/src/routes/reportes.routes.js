const express = require("express");
const { autorizar, fallo } = require("../services/caja-ventas");
const { filtros, leer, catalogos, secciones, maxExportacion } = require("../services/reportes");
const { csv, pdf } = require("../services/reportes-exportacion");

const router = express.Router();

function soloDueno(req, res, operacion) {
  res.set("Cache-Control", "no-store");
  if (!req.session?.usuario) return fallo(res, 401, "Debes iniciar sesión");
  if (req.session.usuario.rol !== "DUENO") return fallo(res, 403, "Reportes es exclusivo del dueño");
  return autorizar(req, res, (c, { actorId }) => operacion(c, actorId));
}

router.get("/catalogos", (req, res) => soloDueno(req, res, async (c, actorId) => res.json(await catalogos(c, actorId))));

function reporte(req, res, formato) {
  return soloDueno(req, res, async (c, actorId) => {
    const { seccion } = req.params;
    if (!secciones.includes(seccion)) return fallo(res, 404, "Reporte no encontrado");
    const f = filtros(req.query);
    if (!f) return fallo(res, 400, "Revisa las fechas y filtros. El rango máximo es de 366 días");
    if (seccion === "productos" && f.orden === "cantidad" && !f.unidad) {
      return fallo(res, 400, "Selecciona una unidad para ordenar productos por cantidad");
    }
    const datos = await leer(c, actorId, seccion, f, Boolean(formato));
    if (!formato) return res.json(datos);
    if (datos.hayMas) return fallo(res, 422, `La exportación supera ${maxExportacion} filas. Acota los filtros`);
    const nombre = `SABOTINO_${seccion}_${f.desde}_${f.hasta}`;
    if (formato === "csv") return res.attachment(`${nombre}.csv`).type("text/csv").send(csv(datos.tabla ?? []));
    const catalogo = await catalogos(c, actorId);
    const subtitulo = Object.keys(catalogo).filter((k) => f[k]).map((k) =>
      `${k}: ${catalogo[k].find((item) => item.ID === f[k])?.NOMBRE ?? f[k]}`).join(" · ");
    const detalles = [subtitulo, f.periodo && `Detalle: ${f.periodo}`, seccion === "ventas" && f.estado !== "TODOS" && `Estado del detalle: ${f.estado}`].filter(Boolean).join(" · ");
    const contenido = { ...datos };
    if (seccion === "pagos") delete contenido.serie; // El detalle ya contiene la evolución por método.
    const documento = await pdf(seccion, f, contenido, detalles);
    return res.attachment(`${nombre}.pdf`).type("pdf").send(documento);
  });
}

router.get("/:seccion", (req, res) => reporte(req, res));
router.get("/:seccion/:formato", (req, res) => {
  const { formato, seccion } = req.params;
  if (!["pdf", "csv"].includes(formato) || (formato === "csv" && seccion === "resumen")) {
    return fallo(res, 404, "Exportación no disponible");
  }
  return reporte(req, res, formato);
});

module.exports = router;
