const express = require("express");
const { obtenerConexion } = require("../config/database");
const { consultarProcedimiento, ejecutarProcedimiento, entradaClob, numeroSalida } = require("../config/procedimientos");

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

// Datos reales para los desplegables, sin asumir proveedores registrados.
router.get("/catalogos", async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    const actorId = req.session.usuario.id;
    const proveedores = await consultarProcedimiento(conexion, "SAB_API_COMPRAS_PROVEEDORES", { actorId });
    const productos = await consultarProcedimiento(conexion, "SAB_API_STOCK_PRODUCTOS", { actorId });
    const insumos = await consultarProcedimiento(conexion, "SAB_API_STOCK_INSUMOS", { actorId, incluirInactivos: 0 });
    res.json({ estado: "OK", proveedores, productos, insumos });
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
    const resultado = await ejecutarProcedimiento(conexion, "SAB_C_PROVEEDOR", {
      actorId: req.session.usuario.id,
      rut: rut.trim(),
      razonSocial: razonSocial.trim(),
      telefono: (telefono || "").trim() || null,
      email: (email || "").trim() || null,
      nuevoId: numeroSalida
    });
    res.status(201).json({
      estado: "OK", mensaje: "Proveedor registrado correctamente",
      idProveedor: resultado.nuevoId
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
    const resultado = await ejecutarProcedimiento(conexion, "SAB_COMPRA_MULTIPLE", {
      actorId: req.session.usuario.id,
      articulosJson: entradaClob(JSON.stringify(normalizados)),
      cantidadLineas: numeroSalida,
      totalCompra: numeroSalida
    });
    console.log("Compra múltiple registrada:", resultado.cantidadLineas, "líneas");
    res.status(201).json({
      estado: "OK",
      mensaje: "Compra registrada correctamente",
      cantidadLineas: resultado.cantidadLineas,
      totalCompra: resultado.totalCompra
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

    const filas = await consultarProcedimiento(conexion, "SAB_API_COMPRAS_HISTORIAL", {
      actorId: req.session.usuario.id, desplazamiento: (pagina - 1) * 100
    });

    const movimientos = filas.slice(0, 100);
    res.json({
      estado: "OK",
      totalMostrados: movimientos.length,
      movimientos,
      hayMas: filas.length > 100
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

router.get("/proveedores", async (req, res) => {
  let conexion;

  try {
    conexion = await obtenerConexion();

    const actorId = req.session.usuario.id;
    const proveedores = await consultarProcedimiento(conexion, "SAB_L_PROVEEDOR", { actorId });
    const vinculados = req.query.productos === "1"
      ? await consultarProcedimiento(conexion, "SAB_API_PROVEEDOR_PRODUCTOS", { actorId }) : undefined;
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

    await ejecutarProcedimiento(conexion, "SAB_U_PROVEEDOR", {
      actorId: req.session.usuario.id,
      id,
      rut: rut.trim(),
      razonSocial: razonSocial.trim(),
      telefono: telefono?.trim() || null,
      email: email?.trim() || null
    });

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
