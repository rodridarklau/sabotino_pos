
const express = require("express");
const oracledb = require("oracledb");
const argon2 = require("argon2");

const { obtenerConexion } = require("../config/database");

const router = express.Router();

// Comprobar si SABOTINO necesita registrar al primer dueño.
router.get("/estado-inicial", async (req, res) => {
  let conexion;

  try {
    conexion = await obtenerConexion();

    const usuarios = await conexion.execute(
      "SELECT COUNT(*) AS TOTAL FROM USUARIO",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const roles = await conexion.execute(
      `SELECT COUNT(*) AS TOTAL
       FROM ROL_USUARIO
       WHERE NOMBRE_ROL = 'DUENO'
         AND ESTADO_ACTIVO = 'S'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      estado: "OK",
      requiereConfiguracion: usuarios.rows[0].TOTAL === 0,
      rolDuenoConfigurado: roles.rows[0].TOTAL > 0
    });

  } catch (error) {
    console.error("Error comprobando configuración:", error.message);

    res.status(500).json({
      estado: "ERROR",
      mensaje: "No se pudo comprobar la configuración inicial"
    });

  } finally {
    if (conexion) await conexion.close();
  }
});

// Registro del primer dueño.
// Oracle impide registrar un segundo dueño inicial.
router.post("/configurar-dueno", async (req, res) => {
  let conexion;

  try {
    const { rut, nombreCompleto, username, password } = req.body || {};

    if (
      typeof rut !== "string" ||
      typeof nombreCompleto !== "string" ||
      typeof username !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        mensaje: "Debes completar todos los campos"
      });
    }

    const rutNormalizado = rut.trim().replace(/\./g, "").toUpperCase();
    const nombre = nombreCompleto.trim();
    const usuario = username.trim();

    if (
      !/^\d{7,8}-[\dK]$/.test(rutNormalizado) ||
      nombre.length < 2 ||
      nombre.length > 100 ||
      usuario.length < 3 ||
      usuario.length > 50 ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        mensaje: "Revisa el RUT, nombre, usuario y contraseña. La contraseña debe tener entre 8 y 128 caracteres."
      });
    }

    conexion = await obtenerConexion();

    const existentes = await conexion.execute(
      "SELECT COUNT(*) AS TOTAL FROM USUARIO",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existentes.rows[0].TOTAL > 0) {
      return res.status(409).json({
        mensaje: "La configuración inicial ya no está disponible"
      });
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id
    });

    const resultado = await conexion.execute(
      `BEGIN
         SAB_REGISTRAR_DUENO_INICIAL(
           :rut,
           :nombre,
           :usuario,
           :passwordHash,
           :nuevoId
         );
       END;`,
      {
        rut: rutNormalizado,
        nombre,
        usuario,
        passwordHash,
        nuevoId: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER
        }
      }
    );

    console.log("Dueño inicial registrado correctamente.");

    res.status(201).json({
      estado: "OK",
      mensaje: "Dueño inicial registrado correctamente",
      idUsuario: resultado.outBinds.nuevoId
    });

  } catch (error) {
    console.error("Error registrando dueño:", error.message);

    const conflicto =
      error.errorNum === 20514 ||
      error.errorNum === 1;

    res.status(conflicto ? 409 : 500).json({
      estado: "ERROR",
      mensaje: conflicto
        ? "Ya existe un registro incompatible con la configuración inicial"
        : "No se pudo completar el registro del dueño"
    });

  } finally {
    if (conexion) await conexion.close();
  }
});


// Limitar intentos de inicio de sesión
const limitarLogin = require("express-rate-limit").rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    mensaje: "Demasiados intentos. Intenta nuevamente más tarde."
  }
});

// Iniciar sesión
router.post("/login", limitarLogin, async (req, res) => {
  let conexion;

  try {
    const username =
      typeof req.body?.username === "string"
        ? req.body.username.trim()
        : "";

    const password = req.body?.password;

    if (
      !username ||
      username.length > 50 ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
    ) {
      return res.status(400).json({
        mensaje: "Debes ingresar usuario y contraseña válidos"
      });
    }

    conexion = await obtenerConexion();

    const resultado = await conexion.execute(
      `SELECT
         U.ID_USUARIO,
         U.USERNAME,
         U.NOMBRE_COMPLETO,
         U.PASSWORD_HASH,
         RAWTOHEX(STANDARD_HASH(U.PASSWORD_HASH, 'SHA256')) AS VERSION_CUENTA,
         R.NOMBRE_ROL
       FROM USUARIO U
       JOIN ROL_USUARIO R ON U.ID_ROL = R.ID_ROL
       WHERE UPPER(U.USERNAME) = UPPER(:username)
         AND U.ESTADO_USUARIO = 'S'
         AND R.ESTADO_ACTIVO = 'S'`,
      { username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const usuario = resultado.rows[0];

    if (
      resultado.rows.length !== 1 ||
      !(await argon2.verify(usuario.PASSWORD_HASH, password))
    ) {
      return res.status(401).json({
        mensaje: "Usuario o contraseña incorrectos"
      });
    }

    // Renovar la sesión para evitar reutilizar un ID anterior
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Los datos los obtiene el servidor desde Oracle
    req.session.usuario = {
      id: usuario.ID_USUARIO,
      username: usuario.USERNAME,
      nombre: usuario.NOMBRE_COMPLETO,
      rol: usuario.NOMBRE_ROL
    };
    req.session.versionCuenta = usuario.VERSION_CUENTA;

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    res.json({
      estado: "OK",
      mensaje: "Inicio de sesión correcto",
      usuario: req.session.usuario
    });

  } catch (error) {
    console.error("Error al iniciar sesión:", error.message);

    res.status(500).json({
      estado: "ERROR",
      mensaje: "No se pudo iniciar sesión"
    });

  } finally {
    if (conexion) await conexion.close();
  }
});

// Consultar el usuario de la sesión actual
router.get("/yo", (req, res) => {
  if (!req.session.usuario) {
    return res.status(401).json({
      autenticado: false,
      mensaje: "No hay una sesión iniciada"
    });
  }

  res.json({
    autenticado: true,
    usuario: req.session.usuario
  });
});

// Cerrar sesión
router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Error al cerrar sesión:", error.message);

      return res.status(500).json({
        mensaje: "No se pudo cerrar la sesión"
      });
    }

    res.clearCookie("sabotino.sid", { path: "/" });

    res.json({
      estado: "OK",
      mensaje: "Sesión cerrada correctamente"
    });
  });
});


module.exports = router;
