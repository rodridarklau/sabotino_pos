const express = require("express");
const oracledb = require("oracledb");
const { obtenerConexion } = require("../config/database");
const { PRODUCTOS_ACTIVOS, INSUMOS, INSUMOS_ACTIVOS } = require("../config/catalogo-stock");

const router = express.Router();
const opciones = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const maximoMilesimas = 999999999999;
const paginaHistorial = 50;
const tiposSql = "SELECT ID_TIPO_AJUSTE, NOMBRE_TIPO_AJUSTE, FACTOR_OPERACION FROM TIPO_AJUSTE_STOCK";
const altasEnCurso = new Set();
const esId = (id) => Number.isSafeInteger(id) && id > 0;
const decimalValido = (valor, escala) => typeof valor === "number" && valor >= 0 &&
  Number.isSafeInteger(Math.round(valor * escala)) && valor === Math.round(valor * escala) / escala;

const erroresAjuste = new Map([
  [20001, [403, "El usuario o su rol está inactivo"]],
  [20002, [403, "El usuario de la sesión ya no existe"]],
  [20003, [403, "Solo el dueño puede ajustar existencias"]],
  [20004, [400, "La cantidad debe ser positiva y tener hasta tres decimales"]],
  [20005, [400, "La unidad del producto requiere cantidades enteras"]],
  [20006, [404, "El producto no existe"]],
  [20150, [404, "El tipo de ajuste ya no existe"]],
  [20151, [404, "El producto no existe"]],
  [20152, [409, "El producto está inactivo"]],
  [20153, [409, "El ajuste dejaría el stock del producto en negativo"]],
  [20170, [400, "Cantidad inválida para ajustar el insumo"]],
  [20171, [404, "El insumo no existe"]],
  [20172, [409, "El insumo está inactivo"]],
  [20173, [400, "La unidad del insumo requiere cantidades enteras"]],
  [20174, [409, "El ajuste dejaría el stock del insumo en negativo"]],
  [20301, [400, "La unidad del producto requiere un stock entero"]],
  [6502, [422, "La cantidad o el saldo excede la precisión de Oracle"]],
  [1438, [422, "El saldo excede la precisión de Oracle"]],
  [12899, [400, "La observación excede el tamaño permitido"]],
  [2291, [409, "Una referencia del ajuste cambió. Actualiza el inventario"]],
  [60, [409, "El ajuste se revirtió por un conflicto con otra operación"]]
]);

function responderError(res, codigo, mensaje, estado = "ERROR") {
  return res.status(codigo).json({ estado, mensaje });
}

router.use((req, res, next) => {
  const usuario = req.session?.usuario;
  if (!Number.isSafeInteger(usuario?.id) || usuario.id <= 0) {
    return responderError(res, 401, "Debes iniciar sesión");
  }
  if (usuario.rol !== "DUENO") {
    return responderError(res, 403, "Solo el dueño puede acceder al inventario");
  }
  res.set("Cache-Control", "no-store");
  next();
});

async function consultar(conexion, sql, binds = {}) {
  return (await conexion.execute(sql, binds, opciones)).rows;
}

async function validarDueno(conexion, actorId) {
  const [permiso] = await consultar(
    conexion, "SELECT SAB_F_ES_DUENO(:actorId) AS PERMITIDO FROM DUAL", { actorId }
  );
  return permiso.PERMITIDO === 1;
}

async function cerrarConexion(conexion) {
  if (!conexion) return;
  try {
    await conexion.close();
  } catch (error) {
    console.error("Error cerrando conexión de inventario:", error.code);
  }
}

router.get("/", async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    if (!await validarDueno(conexion, req.session.usuario.id)) {
      return responderError(res, 403, "El usuario de la sesión ya no tiene acceso al inventario");
    }
    const productos = await consultar(conexion, `${PRODUCTOS_ACTIVOS} ORDER BY P.NOMBRE_PRODUCTO, P.ID_PRODUCTO`);
    const consultaInsumos = req.query.incluirInactivos === "1" ? INSUMOS : INSUMOS_ACTIVOS;
    const insumos = await consultar(conexion, `${consultaInsumos} ORDER BY I.NOMBRE_INSUMO, I.ID_INSUMO`);
    const tipos = await consultar(conexion, `${tiposSql} ORDER BY ID_TIPO_AJUSTE`);
    res.json({ estado: "OK", productos, insumos, tipos });
  } catch (error) {
    console.error("Error consultando inventario:", error.code);
    responderError(res, 500, "No se pudo consultar el inventario");
  } finally {
    await cerrarConexion(conexion);
  }
});

router.get("/historial", async (req, res) => {
  const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > Math.floor(Number.MAX_SAFE_INTEGER / paginaHistorial)) {
    return responderError(res, 400, "Página de historial inválida");
  }

  let conexion;
  try {
    conexion = await obtenerConexion();
    if (!await validarDueno(conexion, req.session.usuario.id)) {
      return responderError(res, 403, "El usuario de la sesión ya no tiene acceso al inventario");
    }
    const ajustes = await consultar(conexion, `SELECT A.ID_AJUSTE, P.NOMBRE_PRODUCTO,
        TO_CHAR(A.FECHA_HORA_AJUSTE, 'DD/MM/YYYY HH24:MI:SS') AS FECHA,
        A.CANTIDAD_AJUSTADA, T.NOMBRE_TIPO_AJUSTE, T.FACTOR_OPERACION,
        A.OBSERVACION, U.NOMBRE_COMPLETO AS RESPONSABLE, M.CODIGO_UNIDAD
      FROM AJUSTE_INVENTARIO A
      JOIN PRODUCTO P ON P.ID_PRODUCTO = A.ID_PRODUCTO
      JOIN UNIDAD_MEDIDA M ON M.ID_UNIDAD = P.ID_UNIDAD
      JOIN TIPO_AJUSTE_STOCK T ON T.ID_TIPO_AJUSTE = A.ID_TIPO_AJUSTE
      JOIN USUARIO U ON U.ID_USUARIO = A.ID_USUARIO
      ORDER BY A.FECHA_HORA_AJUSTE DESC, A.ID_AJUSTE DESC
      OFFSET :desplazamiento ROWS FETCH NEXT :limite ROWS ONLY`, {
      desplazamiento: (pagina - 1) * paginaHistorial,
      limite: paginaHistorial + 1
    });
    res.json({ estado: "OK", ajustes: ajustes.slice(0, paginaHistorial), hayMas: ajustes.length > paginaHistorial });
  } catch (error) {
    console.error("Error consultando historial de ajustes:", error.code);
    responderError(res, 500, "No se pudo consultar el historial de ajustes");
  } finally {
    await cerrarConexion(conexion);
  }
});

router.post("/insumos", async (req, res) => {
  const { unidadId, proveedorId, nombre, costo, stockInicial, stockCritico, estado = "S" } = req.body ?? {};
  if (typeof nombre !== "string" || !nombre.trim()) return responderError(res, 400, "Ingresa el nombre del insumo");
  if (!esId(unidadId) || !esId(proveedorId)) return responderError(res, 400, "Selecciona una unidad y un proveedor válidos");
  if (!decimalValido(costo, 100)) return responderError(res, 400, "Ingresa un costo no negativo con hasta dos decimales");
  if (![stockInicial, stockCritico].every((stock) => decimalValido(stock, 1000) && Math.round(stock * 1000) <= maximoMilesimas)) {
    return responderError(res, 400, "Ingresa existencias no negativas con hasta tres decimales");
  }
  if (!["S", "N"].includes(estado)) return responderError(res, 400, "Selecciona un estado válido");

  const actorId = req.session.usuario.id;
  if (altasEnCurso.has(actorId)) return responderError(res, 409, "Ya hay un alta en curso. Revisa el listado antes de repetirla", "INCIERTO");
  altasEnCurso.add(actorId);
  let conexion;
  let enviado = false;
  try {
    conexion = await obtenerConexion();
    if (!await validarDueno(conexion, actorId)) return responderError(res, 403, "Solo el dueño activo puede registrar insumos");
    const [unidad] = await consultar(conexion, "SELECT PERMITE_DECIMALES FROM UNIDAD_MEDIDA WHERE ID_UNIDAD = :unidadId", { unidadId });
    if (!unidad) return responderError(res, 400, "La unidad seleccionada ya no existe");
    if (unidad.PERMITE_DECIMALES === "N" && ![stockInicial, stockCritico].every(Number.isInteger)) {
      return responderError(res, 400, "La unidad seleccionada requiere existencias enteras");
    }
    const [proveedor] = await consultar(conexion, "SELECT ID_PROVEEDOR FROM PROVEEDOR WHERE ID_PROVEEDOR = :proveedorId", { proveedorId });
    if (!proveedor) return responderError(res, 400, "El proveedor seleccionado ya no existe");
    enviado = true;
    const { outBinds } = await conexion.execute(
      `BEGIN SAB_C_INSUMO(:actorId, :unidadId, :proveedorId, :nombre, :costo,
        :stockInicial, :stockCritico, :estado, :nuevoId); END;`,
      { actorId, unidadId, proveedorId, nombre: nombre.trim(), costo, stockInicial, stockCritico, estado,
        nuevoId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
    );
    if (!esId(outBinds?.nuevoId)) throw new Error("Alta sin identificador");
    res.status(201).json({ estado: "OK", idInsumo: outBinds.nuevoId });
  } catch (error) {
    const numero = error.errorNum;
    if ([20001, 20002, 20003].includes(numero)) return responderError(res, 403, "Solo el dueño activo puede registrar insumos");
    if (numero === 1) return responderError(res, 409, "Ya existe un insumo con ese nombre");
    if (numero === 2291) return responderError(res, 409, "La unidad o el proveedor ya no está disponible");
    if (numero === 12899) return responderError(res, 400, "El nombre del insumo es demasiado largo");
    if ([1438, 6502].includes(numero)) return responderError(res, 422, "Un valor supera el tamaño permitido. Revisa el nombre y los importes");
    console.error("Error registrando insumo:", error.code ?? numero);
    if (numero >= 20000 && numero <= 20999) return responderError(res, 422, "El registro fue rechazado. Revisa los datos del insumo");
    if (enviado) return responderError(res, 503, "No se pudo confirmar el alta. Comprueba el listado antes de volver a guardar", "INCIERTO");
    responderError(res, 500, "No se pudo preparar el registro del insumo");
  } finally {
    await cerrarConexion(conexion);
    altasEnCurso.delete(actorId);
  }
});

router.post("/ajustes", async (req, res) => {
  const { tipoArticulo, articuloId, tipoAjusteId, cantidad, observacion } = req.body ?? {};
  if (!["PRODUCTO", "INSUMO"].includes(tipoArticulo) ||
      !Number.isSafeInteger(articuloId) || articuloId <= 0 ||
      !Number.isSafeInteger(tipoAjusteId) || tipoAjusteId <= 0) {
    return responderError(res, 400, "Selecciona un artículo y un tipo de ajuste válidos");
  }
  const milesimas = typeof cantidad === "number" ? Math.round(cantidad * 1000) : NaN;
  if (cantidad !== milesimas / 1000 ||
      milesimas <= 0 || milesimas > maximoMilesimas) {
    return responderError(res, 400, "Ingresa una cantidad positiva con hasta tres decimales");
  }

  const esProducto = tipoArticulo === "PRODUCTO";
  if (observacion != null && (typeof observacion !== "string" ||
      (esProducto ? Buffer.byteLength(observacion.trim(), "utf8") > 250 : observacion.trim() !== ""))) {
    return responderError(res, 400, esProducto
      ? "La observación puede ocupar hasta 250 bytes"
      : "Los ajustes de insumos no admiten observaciones");
  }

  const actorId = req.session.usuario.id;
  let conexion;
  let ajusteEnviado = false;
  try {
    conexion = await obtenerConexion();
    if (!await validarDueno(conexion, actorId)) {
      return responderError(res, 403, "El usuario de la sesión ya no tiene acceso al inventario");
    }
    const [tipo] = await consultar(conexion, `${tiposSql} WHERE ID_TIPO_AJUSTE = :tipoAjusteId`, { tipoAjusteId });
    if (!tipo) return responderError(res, 404, "El tipo de ajuste ya no existe");

    const sqlArticulo = esProducto
      ? `${PRODUCTOS_ACTIVOS} AND P.ID_PRODUCTO = :articuloId`
      : `${INSUMOS_ACTIVOS} AND I.ID_INSUMO = :articuloId`;
    const [articulo] = await consultar(conexion, sqlArticulo, { articuloId });
    if (!articulo) return responderError(res, 404, "El artículo no existe o está inactivo");
    if (articulo.PERMITE_DECIMALES === "N" && !Number.isInteger(cantidad)) {
      return responderError(res, 400, "La unidad del artículo requiere cantidades enteras");
    }

    // Oracle vuelve a validar sobre la fila bloqueada al aplicar el ajuste.
    const saldo = Math.round(articulo.STOCK_ACTUAL * 1000) + milesimas * tipo.FACTOR_OPERACION;
    if (saldo < 0 || saldo > maximoMilesimas) {
      return responderError(res, 409, saldo < 0
        ? "El ajuste dejaría el stock en negativo" : "El saldo excedería la precisión de Oracle");
    }

    const binds = { actorId, articuloId, tipoAjusteId, cantidad,
      resultado: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } };
    const sql = esProducto
      ? "BEGIN SAB_AJUSTAR_STOCK(:actorId, :articuloId, :tipoAjusteId, :cantidad, :observacion, :resultado); END;"
      : "BEGIN SAB_AJUSTAR_STOCK_INSUMO(:actorId, :articuloId, :tipoAjusteId, :cantidad, :resultado); END;";
    if (esProducto) binds.observacion = observacion?.trim() || null;

    ajusteEnviado = true;
    const { outBinds } = await conexion.execute(sql, binds);
    const resultado = esProducto ? { idAjuste: outBinds.resultado } : { nuevoStock: outBinds.resultado };
    res.status(201).json({ estado: "OK", ...resultado });
  } catch (error) {
    const conocido = erroresAjuste.get(error.errorNum);
    if (conocido) return responderError(res, ...conocido);
    console.error("Error registrando ajuste de inventario:", error.code);
    if (ajusteEnviado) {
      return responderError(res, 503, "No se pudo confirmar el resultado. Revisa existencias e historial antes de repetir el ajuste", "INCIERTO");
    }
    responderError(res, 500, "No se pudo preparar el ajuste");
  } finally {
    await cerrarConexion(conexion);
  }
});

module.exports = router;
