const express = require("express");
const rateLimit = require("express-rate-limit");
const { autorizar, centavos, fallo, filas, idValido, maximo, nombreCajaPrincipal, procedimiento, salida, unidades } = require("../services/caja-ventas");
const { abrirTurno } = require("./caja.routes");
const { generarPdf, nombrePdf, correoComprobante } = require("../services/comprobante");
const correo = require("../services/correo");
const { almacen, presentar } = require("../services/imagenes-productos");

const router = express.Router();
const estados = ["BORRADOR", "CONFIRMADA", "ANULADA"];
const productosSql = `SELECT P.ID_PRODUCTO, P.NOMBRE_PRODUCTO, P.CODIGO_BARRA,
    P.PRECIO_VENTA_ACTUAL, P.STOCK_ACTUAL, P.STOCK_CRITICO, P.ID_CATEGORIA,
    C.NOMBRE_CATEGORIA, U.CODIGO_UNIDAD, U.PERMITE_DECIMALES
  FROM PRODUCTO P JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = P.ID_UNIDAD
  JOIN CATEGORIA_PRODUCTO C ON C.ID_CATEGORIA = P.ID_CATEGORIA
  WHERE P.ESTADO_PRODUCTO = 'S'`;
const metodosSql = "SELECT ID_METODO_PAGO, NOMBRE_METODO, REQUIERE_COMPROBANTE FROM METODO_PAGO";
const ventasSql = `SELECT V.ID_VENTA, V.ID_USUARIO, U.NOMBRE_COMPLETO AS RESPONSABLE,
    TO_CHAR(V.FECHA_HORA_VENTA, 'DD/MM/YYYY HH24:MI:SS') AS FECHA,
    V.ID_TURNO_CAJA, V.ESTADO_VENTA, V.TOTAL_VENTA, C.NOMBRE_CAJA
  FROM VENTA V JOIN USUARIO U ON U.ID_USUARIO = V.ID_USUARIO
  JOIN TURNO_CAJA T ON T.ID_TURNO_CAJA = V.ID_TURNO_CAJA
  JOIN CAJA_TERMINAL C ON C.ID_CAJA = T.ID_CAJA
  WHERE (:dueno = 1 OR V.ID_USUARIO = :actorId)`;

const errores = new Map([
  [60, [409, "Conflicto con otra operación"]],
  [1438, [422, "Un importe excede la precisión de Oracle"]],
  [6502, [422, "Un valor excede la precisión de Oracle"]],
  [20001, [403, "Usuario o rol inactivo"]],
  [20002, [403, "El usuario ya no existe"]],
  [20004, [400, "Cantidad inválida"]],
  [20005, [400, "El producto requiere una cantidad entera"]],
  [20006, [404, "El producto no existe"]],
  [20110, [404, "El turno no existe"]],
  [20111, [409, "El turno está cerrado"]],
  [20112, [404, "La venta no existe"]],
  [20113, [409, "El borrador ya no se puede modificar"]],
  [20114, [404, "El producto no existe"]],
  [20115, [409, "El producto está inactivo"]],
  [20116, [400, "Monto de pago inválido"]],
  [20117, [404, "La venta no existe"]],
  [20118, [409, "El borrador ya no admite pagos"]],
  [20119, [404, "El método de pago no existe"]],
  [20120, [400, "El método de pago requiere comprobante"]],
  [20121, [404, "La venta no existe"]],
  [20122, [404, "El turno no existe"]],
  [20123, [409, "La caja está cerrada"]],
  [20124, [404, "La venta no existe"]],
  [20125, [409, "La venta ya no puede confirmarse"]],
  [20126, [404, "El producto no existe"]],
  [20127, [409, "El producto está inactivo"]],
  [20128, [409, "Stock insuficiente. Actualiza el catálogo"]],
  [20129, [400, "Agrega al menos un producto"]],
  [20130, [409, "El pago no coincide con el total. Revisa los precios vigentes"]],
  [20131, [404, "La venta no existe"]],
  [20132, [409, "La venta ya no puede anularse"]],
  [20301, [409, "El stock del producto requiere unidades enteras"]],
  [20302, [409, "La venta ya finalizó"]],
  [20304, [409, "El detalle ya no se puede editar"]],
  [20306, [409, "El pago ya no se puede editar"]]
]);

const milesimas = (valor) => unidades(valor, 1000, 999999999999);

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/catalogos", (req, res) => autorizar(req, res, async (c, actor) => {
  const turnos = await filas(c, `SELECT T.ID_TURNO_CAJA, C.NOMBRE_CAJA
    FROM TURNO_CAJA T JOIN CAJA_TERMINAL C ON C.ID_CAJA = T.ID_CAJA
    WHERE T.ESTADO_TURNO = 'ABIERTO' AND C.NOMBRE_CAJA = :nombre
    AND C.ESTADO_OPERATIVO = 'S' ORDER BY T.ID_TURNO_CAJA`, { nombre: nombreCajaPrincipal });
  if (!turnos.length) return res.json({ productos: [], metodos: [], turnos });
  const productos = await filas(c, `SELECT P.*, (
    SELECT COUNT(DISTINCT V.ID_VENTA) FROM DETALLE_VENTA D JOIN VENTA V ON V.ID_VENTA = D.ID_VENTA
    WHERE D.ID_PRODUCTO = P.ID_PRODUCTO AND V.ESTADO_VENTA = 'CONFIRMADA'
      AND V.FECHA_HORA_VENTA >= CAST(SYSTIMESTAMP AS TIMESTAMP) - INTERVAL '30' DAY
      AND (:dueno = 1 OR V.ID_USUARIO = :actorId)
  ) AS VENTAS_RECIENTES FROM (${productosSql}) P ORDER BY P.NOMBRE_PRODUCTO, P.ID_PRODUCTO`, actor);
  const asociaciones = await almacen.leer().catch((error) => {
    console.error("No se pudieron cargar las imágenes del catálogo:", error.code);
    return {};
  });
  const metodos = await filas(c, `${metodosSql} ORDER BY NOMBRE_METODO`);
  res.json({ productos: productos.map((p) => ({ ...p, VISUAL: presentar(asociaciones[p.ID_PRODUCTO]) })), metodos, turnos });
}));

router.get("/", (req, res) => autorizar(req, res, async (c, actor) => {
  const pagina = Number(req.query.pagina ?? 1);
  const estado = req.query.estado || null;
  const buscar = typeof req.query.buscar === "string" ? req.query.buscar.trim() : "";
  if (!idValido(pagina) || pagina > 1000000 || (estado && !estados.includes(estado)) || buscar.length > 100) {
    return fallo(res, 400, "Filtros de historial inválidos");
  }
  const ventas = await filas(c, `${ventasSql}
    AND (:estado IS NULL OR V.ESTADO_VENTA = :estado)
    AND (:buscar IS NULL OR INSTR(LOWER(U.NOMBRE_COMPLETO), LOWER(:buscar)) > 0
         OR TO_CHAR(V.ID_VENTA) = :buscar)
    ORDER BY V.FECHA_HORA_VENTA DESC, V.ID_VENTA DESC
    OFFSET :desplazamiento ROWS FETCH NEXT 26 ROWS ONLY`, {
    ...actor, estado, buscar: buscar || null, desplazamiento: (pagina - 1) * 25
  });
  res.json({ ventas: ventas.slice(0, 25), hayMas: ventas.length > 25 });
}));

async function detalleVenta(c, actor, ventaId, comprobante = false) {
  const [venta] = await filas(c, `${ventasSql} AND V.ID_VENTA = :ventaId${comprobante ? " AND V.ESTADO_VENTA = 'CONFIRMADA'" : ""}`, { ...actor, ventaId });
  if (!venta) return null;
  const detalles = await filas(c, `SELECT D.ID_DETALLE_VENTA, P.NOMBRE_PRODUCTO, U.CODIGO_UNIDAD,
      D.CANTIDAD, D.PRECIO_UNITARIO_HISTORICO, D.SUBTOTAL_LINEA
    FROM DETALLE_VENTA D JOIN PRODUCTO P ON P.ID_PRODUCTO = D.ID_PRODUCTO
    JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = P.ID_UNIDAD
    WHERE D.ID_VENTA = :ventaId ORDER BY D.ID_DETALLE_VENTA`, { ventaId });
  const pagos = await filas(c, `SELECT P.ID_PAGO_VENTA, M.NOMBRE_METODO, P.MONTO_PAGADO, P.CODIGO_COMPROBANTE
    FROM PAGO_VENTA P JOIN METODO_PAGO M ON M.ID_METODO_PAGO = P.ID_METODO_PAGO
    WHERE P.ID_VENTA = :ventaId ORDER BY P.ID_PAGO_VENTA`, { ventaId });
  return { venta, detalles, pagos };
}

router.get("/:id", (req, res) => autorizar(req, res, async (c, actor) => {
  const ventaId = Number(req.params.id);
  if (!idValido(ventaId)) return fallo(res, 400, "Identificador inválido");
  const datos = await detalleVenta(c, actor, ventaId);
  if (!datos) return fallo(res, 404, "Venta no encontrada");
  const { venta } = datos;
  res.json({ ...datos, puedeAnular: venta.ESTADO_VENTA === "BORRADOR" && venta.ID_USUARIO === actor.actorId });
}));

async function comprobante(req, res, responder) {
  let datos;
  await autorizar(req, res, async (c, actor) => {
    const id = Number(req.params.id);
    if (!idValido(id)) return fallo(res, 400, "Identificador inválido");
    datos = await detalleVenta(c, actor, id, true);
    if (!datos) return fallo(res, 404, "Comprobante no disponible");
  });
  if (!datos) return;
  try {
    await responder(datos);
  } catch {
    fallo(res, 500, "No se pudo generar el comprobante");
  }
}

router.get("/:id/comprobante", (req, res) => comprobante(req, res, (datos) => res.json(datos)));
router.get("/:id/comprobante/pdf", (req, res) => comprobante(req, res, async (datos) => {
  const pdf = await generarPdf(datos);
  res.attachment(nombrePdf(datos.venta.ID_VENTA)).type("pdf").send(pdf);
}));

const limitarCorreo = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false,
  message: { estado: "ERROR", mensaje: "Límite de envíos alcanzado. Intenta más tarde" }
});
const envios = new Set();

router.post("/:id/comprobante/correo", limitarCorreo, (req, res) => comprobante(req, res, async (datos) => {
  const destinatario = correo.validarDestinatario(req.body?.destinatario);
  if (!destinatario) return fallo(res, 400, "Ingresa una dirección de correo válida");
  const intento = req.body?.intento;
  if (intento !== undefined && (typeof intento !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(intento))) {
    return fallo(res, 400, "Identificador de envío inválido");
  }
  if (!correo.configurado()) return fallo(res, 503, "El servicio de correo todavía no está configurado");
  const bloqueo = correo.claveEnvio(datos.venta.ID_VENTA, destinatario);
  if (envios.has(bloqueo)) return fallo(res, 409, "Ya hay un envío en curso para este comprobante");
  envios.add(bloqueo);
  try {
    const pdf = await generarPdf(datos);
    await correo.enviar(destinatario, correoComprobante(datos.venta, pdf),
      intento ? correo.claveEnvio(datos.venta.ID_VENTA, destinatario, intento) : bloqueo);
    res.json({ estado: "OK", mensaje: "El proveedor aceptó el correo para envío" });
  } catch (error) {
    if ([401, 403].includes(error.estadoProveedor)) {
      return fallo(res, 503, "Resend rechazó las credenciales o el remitente. Revisa la clave y el dominio verificado");
    }
    if (error.estadoProveedor === 429) return fallo(res, 503, "Resend alcanzó su límite de envíos. Intenta más tarde");
    if (error.codigoProveedor === "concurrent_idempotent_requests") {
      return fallo(res, 409, "Resend sigue procesando este envío. Intenta más tarde");
    }
    if (error.codigoProveedor === "invalid_idempotent_request") {
      return fallo(res, 409, "El contenido cambió. Verifica el envío anterior en Resend antes de iniciar otro");
    }
    fallo(res, 502, "No se pudo confirmar el envío del correo. El comprobante sigue disponible");
  } finally {
    envios.delete(bloqueo);
  }
}));

function incierto(res, ventaId) {
  return fallo(res, 503, "Resultado incierto. Consulta el historial antes de repetir la operación", {
    estado: "INCIERTO", ...(ventaId ? { ventaId } : {})
  });
}

router.post("/turnos", abrirTurno);

async function validarVenta(c, { turnoId, lineas, pagos, totalEsperado }) {
  if (!idValido(turnoId) || !Array.isArray(lineas) || !lineas.length || lineas.length > 100 ||
      !Array.isArray(pagos) || pagos.length > 100 || !Number.isFinite(centavos(totalEsperado)) ||
      lineas.some((l) => !idValido(l?.productoId) || !(milesimas(l.cantidad) > 0)) ||
      pagos.some((p) => !idValido(p?.metodoId) || !(centavos(p.monto) > 0) ||
        (p.comprobante != null && (typeof p.comprobante !== "string" || Buffer.byteLength(p.comprobante.trim(), "utf8") > 50)))) {
    return [400, "Revisa el turno, las cantidades y los pagos (hasta 100 líneas por sección)"];
  }
  if (new Set(lineas.map((l) => l.productoId)).size !== lineas.length) {
    return [400, "Usa una única línea por producto"];
  }
  const [turno] = await filas(c, `SELECT T.ID_TURNO_CAJA FROM TURNO_CAJA T
    JOIN CAJA_TERMINAL C ON C.ID_CAJA = T.ID_CAJA
    WHERE T.ID_TURNO_CAJA = :turnoId AND T.ESTADO_TURNO = 'ABIERTO'
      AND C.NOMBRE_CAJA = :nombre AND C.ESTADO_OPERATIVO = 'S'`, { turnoId, nombre: nombreCajaPrincipal });
  if (!turno) return [409, "Abre un turno en la Caja Principal para vender"];
  const ids = Object.fromEntries(lineas.map(({ productoId }, i) => [`p${i}`, productoId]));
  const productos = await filas(c, `${productosSql} AND P.ID_PRODUCTO IN (${Object.keys(ids).map((id) => `:${id}`).join(", ")})`, ids);
  const porId = new Map(productos.map((p) => [p.ID_PRODUCTO, p]));
  const metodos = await filas(c, metodosSql);
  let total = 0n;
  for (const linea of lineas) {
    const producto = porId.get(linea.productoId);
    if (!producto) return [409, "Un producto ya no está activo"];
    if (producto.PERMITE_DECIMALES === "N" && !Number.isInteger(linea.cantidad)) return [400, "Un producto requiere cantidad entera"];
    if (linea.cantidad > producto.STOCK_ACTUAL) return [409, `Stock insuficiente para ${producto.NOMBRE_PRODUCTO}`];
    total += (BigInt(milesimas(linea.cantidad)) * BigInt(centavos(producto.PRECIO_VENTA_ACTUAL)) + 500n) / 1000n;
  }
  let pagado = 0n;
  for (const pago of pagos) {
    const metodo = metodos.find((m) => m.ID_METODO_PAGO === pago.metodoId);
    if (!metodo || (metodo.REQUIERE_COMPROBANTE === "S" && !pago.comprobante?.trim())) {
      return [400, "Selecciona un método válido e ingresa el comprobante si corresponde"];
    }
    pagado += BigInt(centavos(pago.monto));
  }
  if (total > BigInt(maximo) || total !== BigInt(centavos(totalEsperado)) || total !== pagado) {
    return [409, "El total y los pagos deben coincidir con los precios vigentes"];
  }
}

router.post("/", (req, res) => autorizar(req, res, async (c, { actorId }) => {
  const venta = req.body ?? {};
  const invalida = await validarVenta(c, venta);
  if (invalida) return fallo(res, ...invalida);
  let ventaId;
  try {
    ventaId = await procedimiento(c, "SAB_VENTA_INICIAR", { actorId, turnoId: venta.turnoId, resultado: salida });
    for (const { productoId, cantidad } of venta.lineas) {
      await procedimiento(c, "SAB_VENTA_AGREGAR_PRODUCTO", { actorId, ventaId, productoId, cantidad, resultado: salida });
    }
    for (const { metodoId, monto, comprobante } of venta.pagos) {
      await procedimiento(c, "SAB_VENTA_AGREGAR_PAGO", {
        actorId, ventaId, metodoId, monto, comprobante: comprobante?.trim() || null, resultado: salida
      });
    }
    const total = await procedimiento(c, "SAB_VENTA_CONFIRMAR", { actorId, ventaId, resultado: salida });
    res.status(201).json({ ventaId, total });
  } catch (error) {
    const conocido = errores.get(error.errorNum);
    if (!conocido) return incierto(res, ventaId);
    if (ventaId) {
      try {
        await procedimiento(c, "SAB_VENTA_CANCELAR", { actorId, ventaId });
      } catch {
        return incierto(res, ventaId);
      }
    }
    fallo(res, ...conocido, ventaId ? { ventaId, anulada: true } : {});
  }
}, true));

router.post("/:id/anulacion", (req, res) => autorizar(req, res, async (c, { actorId }) => {
  const ventaId = Number(req.params.id);
  if (!idValido(ventaId)) return fallo(res, 400, "Identificador inválido");
  const [propia] = await filas(c, "SELECT ID_VENTA FROM VENTA WHERE ID_VENTA = :ventaId AND ID_USUARIO = :actorId", { actorId, ventaId });
  if (!propia) return fallo(res, 404, "Borrador propio no encontrado");
  try {
    await procedimiento(c, "SAB_VENTA_CANCELAR", { actorId, ventaId });
    res.json({ ventaId });
  } catch (error) {
    const conocido = errores.get(error.errorNum);
    if (conocido) return fallo(res, ...conocido);
    incierto(res, ventaId);
  }
}, true));

module.exports = router;
