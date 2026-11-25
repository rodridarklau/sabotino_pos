const express = require("express");
const oracledb = require("oracledb");
const { obtenerConexion } = require("../config/database");
const { PRODUCTOS_ACTIVOS, INSUMOS_ACTIVOS } = require("../config/catalogo-stock");

const router = express.Router();

// La sesión y el rol siempre se comprueban en el backend.
router.use((req, res, next) => {
  if (!req.session?.usuario) {
    return res.status(401).json({ estado: "ERROR", mensaje: "Debes iniciar sesión" });
  }
  if (req.session.usuario.rol !== "DUENO") {
    return res.status(403).json({ estado: "ERROR", mensaje: "Solo el dueño puede registrar compras" });
  }
  next();
});

const opciones = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// Datos reales para los desplegables, sin asumir proveedores registrados.
router.get("/catalogos", async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    const proveedores = await conexion.execute(
      `SELECT ID_PROVEEDOR, RAZON_SOCIAL, RUT_PROVEEDOR
       FROM PROVEEDOR ORDER BY RAZON_SOCIAL`, [], opciones
    );
    const productos = await conexion.execute(
      `${PRODUCTOS_ACTIVOS} ORDER BY P.NOMBRE_PRODUCTO`, [], opciones
    );
    const insumos = await conexion.execute(
      `${INSUMOS_ACTIVOS} ORDER BY I.NOMBRE_INSUMO`, [], opciones
    );

    res.json({
      estado: "OK",
      proveedores: proveedores.rows,
      productos: productos.rows,
      insumos: insumos.rows
    });
  } catch (error) {
    console.error("Error consultando catálogos para compras:", error);
    res.status(500).json({ estado: "ERROR", mensaje: "No se pudieron consultar los datos para compras" });
  } finally {
    if (conexion) await conexion.close();
  }
});

// Permite crear el primer proveedor sin editar tablas manualmente.
router.post("/proveedores", async (req, res) => {
  const { rut, razonSocial, telefono, email } = req.body || {};
  if (
    typeof rut !== "string" || rut.trim().length < 3 || rut.trim().length > 12 ||
    typeof razonSocial !== "string" || !razonSocial.trim() || razonSocial.trim().length > 120 ||
    (telefono != null && (typeof telefono !== "string" || telefono.trim().length > 20)) ||
    (email != null && (typeof email !== "string" || email.trim().length > 100))
  ) {
    return res.status(400).json({ estado: "ERROR", mensaje: "Revisa los datos del proveedor" });
  }

  let conexion;
  try {
    conexion = await obtenerConexion();
    const resultado = await conexion.execute(
      `BEGIN SAB_C_PROVEEDOR(:actorId, :rut, :razonSocial, :telefono, :email, :nuevoId); END;`,
      {
        actorId: req.session.usuario.id,
        rut: rut.trim(),
        razonSocial: razonSocial.trim(),
        telefono: (telefono || "").trim() || null,
        email: (email || "").trim() || null,
        nuevoId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      }
    );
    res.status(201).json({
      estado: "OK", mensaje: "Proveedor registrado correctamente",
      idProveedor: resultado.outBinds.nuevoId
    });
  } catch (error) {
    console.error("Error registrando proveedor:", error);
    res.status(error.errorNum === 1 ? 409 : 500).json({
      estado: "ERROR",
      mensaje: error.errorNum === 1
        ? "Ya existe un proveedor con ese RUT"
        : "No se pudo registrar el proveedor"
    });
  } finally {
    if (conexion) await conexion.close();
  }
});

function enteroPositivo(valor) {
  return Number.isSafeInteger(valor) && valor > 0;
}

function decimalValido(numero, decimales, maximo) {
  if (typeof numero !== "number" || !Number.isFinite(numero) || numero < 0 || numero > maximo) {
    return false;
  }
  const escala = 10 ** decimales;
  return Math.abs(numero * escala - Math.round(numero * escala)) < 0.00001;
}

// La compra es atómica: Oracle confirma todo o revierte todo.
router.post("/", async (req, res) => {
  const articulos = req.body?.articulos;
  if (!Array.isArray(articulos) || articulos.length === 0 || articulos.length > 50) {
    return res.status(400).json({ estado: "ERROR", mensaje: "Agrega entre 1 y 50 líneas a la compra" });
  }

  // Convertimos a números reales para que JSON_OBJECT_T.is_number se cumpla.
  const normalizados = [];
  for (const [indice, linea] of articulos.entries()) {
    if (!linea || typeof linea !== "object" || Array.isArray(linea)) {
      return res.status(400).json({ estado: "ERROR", mensaje: `Línea ${indice + 1}: datos inválidos` });
    }

    const tipo = linea.tipo;
    const numeroEntrada = (valor) => typeof valor === "number" ||
      (typeof valor === "string" && valor.trim()) ? Number(valor) : NaN;
    const id_articulo = numeroEntrada(linea.id_articulo);
    const id_proveedor = numeroEntrada(linea.id_proveedor);
    const cantidad = numeroEntrada(linea.cantidad);
    const costo_unitario = numeroEntrada(linea.costo_unitario);

    if (
      !["PRODUCTO", "INSUMO"].includes(tipo) ||
      !enteroPositivo(id_articulo) || !enteroPositivo(id_proveedor) ||
      !decimalValido(cantidad, 3, 999999999) || cantidad <= 0 ||
      !decimalValido(costo_unitario, 2, 999999999999.99)
    ) {
      return res.status(400).json({
        estado: "ERROR", mensaje: `Revisa el artículo, proveedor, cantidad y costo de la línea ${indice + 1}`
      });
    }

    normalizados.push({ tipo, id_articulo, id_proveedor, cantidad, costo_unitario });
  }

  let conexion;
  try {
    // Tomar una conexión nueva del pool; no hay transacciones previas pendientes.
    conexion = await obtenerConexion();
    const resultado = await conexion.execute(
      `BEGIN
         SAB_COMPRA_MULTIPLE(
           :actorId, :articulosJson, :cantidadLineas, :totalCompra
         );
       END;`,
      {
        actorId: req.session.usuario.id,
        articulosJson: {
          val: JSON.stringify(normalizados),
          type: oracledb.DB_TYPE_CLOB,
          dir: oracledb.BIND_IN
        },
        cantidadLineas: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        totalCompra: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      }
    );
    console.log("Compra múltiple registrada:", resultado.outBinds.cantidadLineas, "líneas");
    res.status(201).json({
      estado: "OK",
      mensaje: "Compra registrada correctamente",
      cantidadLineas: resultado.outBinds.cantidadLineas,
      totalCompra: resultado.outBinds.totalCompra
    });
  } catch (error) {
    console.error("Error en compra múltiple:", error.code);
    const numero = Number(error.errorNum) || Number(String(error.message).match(/ORA-(\d{5})/)?.[1]);
    let mensaje = "No se pudo registrar la compra. No se aplicó ningún abastecimiento.";
    let codigo = 400;
    if (numero === 2291) mensaje = "El proveedor o artículo seleccionado no existe";
    else if (numero === 20161 || numero === 20183) mensaje = "Uno de los artículos no existe";
    else if (numero === 20162 || numero === 20184) mensaje = "Uno de los artículos está inactivo";
    else if (numero === 20185) mensaje = "La unidad de un insumo no permite cantidades decimales";
    else if (numero === 20182) mensaje = "El proveedor seleccionado no existe";
    else if (numero === 20160 || numero === 20181 || numero === 20208 || numero === 20209)
      mensaje = "Una cantidad o costo unitario no es válido";
    else if ([20001, 20002, 20003].includes(numero)) { codigo = 403; mensaje = "No tienes permisos para registrar esta compra"; }
    else if (numero === 20180) mensaje = "La cantidad del insumo no es válida";
    else if (!(numero >= 20000 && numero <= 20999)) {
      return res.status(503).json({ estado: "INCIERTO",
        mensaje: "No se pudo confirmar la compra. Revisa el historial y las existencias antes de enviarla otra vez" });
    }
    res.status(codigo).json({ estado: "ERROR", mensaje });
  } finally {
    if (conexion) await conexion.close();
  }
});

/* =========================================
   HISTORIAL DE COMPRAS DE PRODUCTOS
========================================= */

router.get("/historial", async (req, res) => {
  const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > Math.floor(Number.MAX_SAFE_INTEGER / 100)) {
    return res.status(400).json({ estado: "ERROR", mensaje: "Página de historial inválida" });
  }
  let conexion;

  try {
    conexion = await obtenerConexion();

    const resultado = await conexion.execute(
      `SELECT
          A.ID_ABASTECIMIENTO,
          TO_CHAR(A.FECHA_COMPRA, 'DD/MM/YYYY HH24:MI') AS FECHA_COMPRA,
          P.NOMBRE_PRODUCTO,
          U.CODIGO_UNIDAD,
          PR.RAZON_SOCIAL AS PROVEEDOR,
          US.NOMBRE_COMPLETO AS RESPONSABLE,
          A.CANTIDAD_COMPRADA,
          A.COSTO_UNITARIO_COMPRA,
          ROUND(
            A.CANTIDAD_COMPRADA * A.COSTO_UNITARIO_COMPRA,
            2
          ) AS TOTAL
       FROM ABASTECIMIENTO_PROVEEDOR A

       JOIN PRODUCTO P
         ON A.ID_PRODUCTO = P.ID_PRODUCTO

       JOIN UNIDAD_MEDIDA U
         ON P.ID_UNIDAD = U.ID_UNIDAD

       JOIN PROVEEDOR PR
         ON A.ID_PROVEEDOR = PR.ID_PROVEEDOR

       JOIN USUARIO US
         ON A.ID_USUARIO = US.ID_USUARIO

       ORDER BY A.FECHA_COMPRA DESC,
                A.ID_ABASTECIMIENTO DESC

       OFFSET :desplazamiento ROWS FETCH NEXT 101 ROWS ONLY`,
      { desplazamiento: (pagina - 1) * 100 },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const movimientos = resultado.rows.slice(0, 100);
    res.json({
      estado: "OK",
      totalMostrados: movimientos.length,
      movimientos,
      hayMas: resultado.rows.length > 100
    });

  } catch (error) {
    console.error(
      "Error consultando historial de compras:",
      error
    );

    res.status(500).json({
      estado: "ERROR",
      mensaje: "No se pudo consultar el historial de compras"
    });

  } finally {
    if (conexion) {
      await conexion.close();
    }
  }
});


/* =========================================
   LISTAR PROVEEDORES
========================================= */

const { ULTIMO_PROVEEDOR_PRODUCTO } = require("../config/catalogo-stock");

router.get("/proveedores", async (req, res) => {
  let conexion;
  let cursor;

  try {
    conexion = await obtenerConexion();

    const resultado = await conexion.execute(
      `BEGIN
         SAB_L_PROVEEDOR(:actorId, :resultado);
       END;`,
      {
        actorId: req.session.usuario.id,
        resultado: {
          dir: oracledb.BIND_OUT,
          type: oracledb.CURSOR
        }
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    cursor = resultado.outBinds.resultado;

    const proveedores = [];

    while (true) {
      const filas = await cursor.getRows(200);

      if (filas.length === 0) break;

      proveedores.push(...filas);
    }

    const vinculados = req.query.productos === "1" ? (await conexion.execute(
      `SELECT A.ID_PROVEEDOR, P.ID_PRODUCTO, P.NOMBRE_PRODUCTO FROM (${ULTIMO_PROVEEDOR_PRODUCTO}) A
       JOIN PRODUCTO P ON P.ID_PRODUCTO = A.ID_PRODUCTO ORDER BY P.NOMBRE_PRODUCTO, P.ID_PRODUCTO`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )).rows : undefined;
    res.json({
      estado: "OK",
      total: proveedores.length,
      proveedores, vinculados
    });

  } catch (error) {
    console.error("Error listando proveedores:", error);

    res.status(500).json({
      estado: "ERROR",
      mensaje: "No se pudieron consultar los proveedores"
    });

  } finally {
    if (cursor) await cursor.close();
    if (conexion) await conexion.close();
  }
});


/* =========================================
   EDITAR PROVEEDOR
========================================= */

router.put("/proveedores/:id", async (req, res) => {
  const id = Number(req.params.id);

  const { rut, razonSocial, telefono, email } = req.body || {};

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof rut !== "string" ||
    rut.trim().length < 3 ||
    rut.trim().length > 12 ||
    typeof razonSocial !== "string" ||
    !razonSocial.trim() ||
    razonSocial.trim().length > 120 ||
    (telefono != null &&
      (typeof telefono !== "string" ||
        telefono.trim().length > 20)) ||
    (email != null &&
      (typeof email !== "string" ||
        email.trim().length > 100))
  ) {
    return res.status(400).json({
      estado: "ERROR",
      mensaje: "Revisa los datos del proveedor"
    });
  }

  let conexion;

  try {
    conexion = await obtenerConexion();

    await conexion.execute(
      `BEGIN
         SAB_U_PROVEEDOR(
           :actorId,
           :id,
           :rut,
           :razonSocial,
           :telefono,
           :email
         );
       END;`,
      {
        actorId: req.session.usuario.id,
        id,
        rut: rut.trim(),
        razonSocial: razonSocial.trim(),
        telefono: telefono?.trim() || null,
        email: email?.trim() || null
      }
    );

    res.json({
      estado: "OK",
      mensaje: "Proveedor actualizado correctamente"
    });

  } catch (error) {
    console.error("Error editando proveedor:", error);

    const numero = Number(error.errorNum);

    res.status(
      numero === 1 ? 409 :
      numero === 20013 ? 404 : 500
    ).json({
      estado: "ERROR",
      mensaje:
        numero === 1
          ? "Ya existe otro proveedor con ese RUT"
          : numero === 20013
          ? "Proveedor no encontrado"
          : "No se pudo actualizar el proveedor"
    });

  } finally {
    if (conexion) await conexion.close();
  }
});

module.exports = router;
