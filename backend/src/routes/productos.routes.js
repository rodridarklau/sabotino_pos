const { alertasStockSql } = require("../services/alertas-stock");
const express = require("express");
const oracledb = require("oracledb");
const { obtenerConexion } = require("../config/database");

const router = express.Router();

// Todas las rutas de este módulo requieren sesión activa.
// En server.js, montar authRoutes ANTES que productosRoutes.
router.use((req, res, next) => {
  if (!req.session?.usuario) {
    return res.status(401).json({
      estado: "ERROR",
      mensaje: "Debes iniciar sesión"
    });
  }
  next();
});

function exigirDueno(req, res, next) {
  if (req.session.usuario.rol !== "DUENO") {
    return res.status(403).json({
      estado: "ERROR",
      mensaje: "Solo el dueño puede realizar esta operación"
    });
  }
  next();
}

const idValido = (valor) =>
  String(valor ?? "").trim() !== "" &&
  Number.isSafeInteger(Number(valor)) &&
  Number(valor) > 0;

function datosProductoValidos(datos) {
  const {
    idCategoria, idUnidad, idMarca, codigoBarra, nombreProducto,
    costoProduccion, precioVenta, stockCritico
  } = datos || {};

  const precioValido = (valor) =>
    String(valor ?? "").trim() !== "" &&
    Number.isFinite(Number(valor)) &&
    Number(valor) >= 0 &&
    Number(valor) <= 999999999999.99 &&
    Math.abs(Number(valor) * 100 - Math.round(Number(valor) * 100)) < 0.0001;

  const stockValido =
    String(stockCritico ?? "").trim() !== "" &&
    Number.isFinite(Number(stockCritico)) &&
    Number(stockCritico) >= 0 &&
    Number(stockCritico) <= 999999999.999 &&
    Math.abs(Number(stockCritico) * 1000 - Math.round(Number(stockCritico) * 1000)) < 0.0001;

  return (
    idValido(idCategoria) && idValido(idUnidad) && idValido(idMarca) &&
    typeof codigoBarra === "string" &&
    codigoBarra.trim().length > 0 && codigoBarra.trim().length <= 50 &&
    typeof nombreProducto === "string" &&
    nombreProducto.trim().length > 0 && nombreProducto.trim().length <= 100 &&
    precioValido(costoProduccion) && precioValido(precioVenta) && stockValido
  );
}

function bindsProducto(datos, actorId) {
  return {
    actorId,
    idCategoria: Number(datos.idCategoria),
    idUnidad: Number(datos.idUnidad),
    idMarca: Number(datos.idMarca),
    codigoBarra: datos.codigoBarra.trim(),
    nombreProducto: datos.nombreProducto.trim(),
    costoProduccion: Number(datos.costoProduccion),
    precioVenta: Number(datos.precioVenta),
    stockCritico: Number(datos.stockCritico)
  };
}

function errorOracle(error) {
  const numero = Number(error.errorNum) ||
    Number(String(error.message).match(/ORA-(\d{5})/)?.[1]);

  switch (numero) {
    case 1:
      return { codigo: 409, mensaje: "El código de barras ya está registrado" };
    case 20011:
    case 20014:
      return { codigo: 404, mensaje: "Producto no encontrado" };
    case 20012:
      return {
        codigo: 409,
        mensaje: "No puedes cambiar la unidad de medida: este producto tiene stock o movimientos registrados"
      };
    case 2290:
    case 2291:
    case 1438:
    case 1400:
    case 12899:
      return { codigo: 400, mensaje: "Los datos no cumplen las restricciones de Oracle" };
    default:
      return { codigo: 500, mensaje: "No se pudo completar la operación en Oracle" };
  }
}

// Listar tablas (herramienta de diagnóstico local, solo dueño).
router.get("/tablas", exigirDueno, async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    const resultado = await conexion.execute(
      "SELECT TABLE_NAME FROM USER_TABLES ORDER BY TABLE_NAME",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({ estado: "OK", total: resultado.rows.length, tablas: resultado.rows });
  } catch (error) {
    console.error("Error consultando tablas:", error.message);
    res.status(500).json({ estado: "ERROR", mensaje: "No se pudieron consultar las tablas" });
  } finally {
    if (conexion) await conexion.close();
  }
});

// Listar los primeros 20 productos (la paginación vendrá después).
router.get("/productos", async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    const resultado = await conexion.execute(
      `SELECT * FROM PRODUCTO
       ORDER BY ID_PRODUCTO DESC
       FETCH FIRST 20 ROWS ONLY`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`Consulta de productos realizada: ${resultado.rows.length} registros`);
    res.json({
      estado: "OK",
      totalMostrados: resultado.rows.length,
      productos: resultado.rows
    });
  } catch (error) {
    console.error("Error consultando productos:", error.message);
    res.status(500).json({ estado: "ERROR", mensaje: "No se pudieron consultar los productos" });
  } finally {
    if (conexion) await conexion.close();
  }
});

// Listar opciones de categoría, marca y unidad.
router.get("/catalogos", async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    const opciones = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const categorias = await conexion.execute(
      `SELECT ID_CATEGORIA, NOMBRE_CATEGORIA, DESCRIPCION_CATEGORIA
       FROM CATEGORIA_PRODUCTO ORDER BY NOMBRE_CATEGORIA`, [], opciones
    );
    const marcas = await conexion.execute(
      `SELECT ID_MARCA, NOMBRE_MARCA, ORIGEN_ELABORACION
       FROM MARCA ORDER BY NOMBRE_MARCA`, [], opciones
    );
    const unidades = await conexion.execute(
      `SELECT ID_UNIDAD, CODIGO_UNIDAD, NOMBRE_UNIDAD, PERMITE_DECIMALES
       FROM UNIDAD_MEDIDA ORDER BY NOMBRE_UNIDAD`, [], opciones
    );
    res.json({
      estado: "OK",
      categorias: categorias.rows,
      marcas: marcas.rows,
      unidades: unidades.rows
    });
  } catch (error) {
    console.error("Error en catálogos:", error.message);
    res.status(500).json({ estado: "ERROR", mensaje: "No se pudieron obtener los catálogos" });
  } finally {
    if (conexion) await conexion.close();
  }
});

// Consultar productos activos con poco stock.
router.get("/productos/alertas-stock", async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    const resultado = await conexion.execute(
      alertasStockSql,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({ estado: "OK", totalAlertas: resultado.rows.length, alertas: resultado.rows });
  } catch (error) {
    console.error("Error consultando alertas:", error.message);
    res.status(500).json({ estado: "ERROR", mensaje: "No se pudieron consultar las alertas" });
  } finally {
    if (conexion) await conexion.close();
  }
});

// Crear: reutilizar el procedimiento PL/SQL existente.
router.post("/productos", exigirDueno, async (req, res) => {
  if (!datosProductoValidos(req.body)) {
    return res.status(400).json({ estado: "ERROR", mensaje: "Revisa los datos del producto" });
  }

  let conexion;
  try {
    conexion = await obtenerConexion();
    const resultado = await conexion.execute(
      `BEGIN
         SAB_C_PRODUCTO(
           :actorId, :idCategoria, :idUnidad, :idMarca,
           :codigoBarra, :nombreProducto, :costoProduccion,
           :precioVenta, :stockCritico, :estadoProducto, :nuevoId
         );
       END;`,
      {
        ...bindsProducto(req.body, req.session.usuario.id),
        estadoProducto: "S",
        nuevoId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    console.log("Producto registrado:", resultado.outBinds.nuevoId);
    res.status(201).json({
      estado: "OK",
      mensaje: "Producto registrado correctamente",
      idProducto: resultado.outBinds.nuevoId
    });
  } catch (error) {
    console.error("Error registrando producto:", error.message);
    const detalle = errorOracle(error);
    res.status(detalle.codigo).json({ estado: "ERROR", mensaje: detalle.mensaje });
  } finally {
    if (conexion) await conexion.close();
  }
});

// Editar: NO actualiza STOCK_ACTUAL ni permite reactivar productos desde este formulario.
router.put("/productos/:id", exigirDueno, async (req, res) => {
  if (!idValido(req.params.id) || !datosProductoValidos(req.body)) {
    return res.status(400).json({ estado: "ERROR", mensaje: "Revisa el ID y los datos del producto" });
  }

  let conexion;
  try {
    conexion = await obtenerConexion();
    const actual = await conexion.execute(
      `SELECT ESTADO_PRODUCTO FROM PRODUCTO WHERE ID_PRODUCTO = :id FOR UPDATE`,
      { id: Number(req.params.id) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (actual.rows.length === 0) {
      return res.status(404).json({ estado: "ERROR", mensaje: "Producto no encontrado" });
    }
    if (actual.rows[0].ESTADO_PRODUCTO !== "S") {
      return res.status(409).json({ estado: "ERROR", mensaje: "No se puede editar un producto inactivo" });
    }

    await conexion.execute(
      `BEGIN
         SAB_U_PRODUCTO(
           :actorId, :id, :idCategoria, :idUnidad, :idMarca,
           :codigoBarra, :nombreProducto, :costoProduccion,
           :precioVenta, :stockCritico, :estadoProducto
         );
       END;`,
      {
        ...bindsProducto(req.body, req.session.usuario.id),
        id: Number(req.params.id),
        estadoProducto: "S"
      }
    );
    // El procedimiento de Oracle ejecuta COMMIT si todo fue exitoso.
    console.log("Producto actualizado:", Number(req.params.id));
    res.json({ estado: "OK", mensaje: "Producto actualizado correctamente", idProducto: Number(req.params.id) });
  } catch (error) {
    console.error("Error actualizando producto:", error.message);
    const detalle = errorOracle(error);
    res.status(detalle.codigo).json({ estado: "ERROR", mensaje: detalle.mensaje });
  } finally {
    if (conexion) await conexion.close();
  }
});

// Desactivar: SAB_D_PRODUCTO marca ESTADO_PRODUCTO='N', no borra la fila.
router.delete("/productos/:id", exigirDueno, async (req, res) => {
  if (!idValido(req.params.id)) {
    return res.status(400).json({ estado: "ERROR", mensaje: "ID de producto inválido" });
  }

  let conexion;
  try {
    conexion = await obtenerConexion();
    const actual = await conexion.execute(
      `SELECT ESTADO_PRODUCTO FROM PRODUCTO WHERE ID_PRODUCTO = :id FOR UPDATE`,
      { id: Number(req.params.id) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (actual.rows.length === 0) {
      return res.status(404).json({ estado: "ERROR", mensaje: "Producto no encontrado" });
    }
    if (actual.rows[0].ESTADO_PRODUCTO === "N") {
      return res.status(409).json({ estado: "ERROR", mensaje: "El producto ya está desactivado" });
    }

    await conexion.execute(
      `BEGIN SAB_D_PRODUCTO(:actorId, :id); END;`,
      {
        actorId: req.session.usuario.id,
        id: Number(req.params.id)
      }
    );
    console.log("Producto desactivado:", Number(req.params.id));
    res.json({ estado: "OK", mensaje: "Producto desactivado correctamente", idProducto: Number(req.params.id) });
  } catch (error) {
    console.error("Error desactivando producto:", error.message);
    const detalle = errorOracle(error);
    res.status(detalle.codigo).json({ estado: "ERROR", mensaje: detalle.mensaje });
  } finally {
    if (conexion) await conexion.close();
  }
});

module.exports = router;
