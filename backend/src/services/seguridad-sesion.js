const { obtenerConexion } = require("../config/database");
const { consultarProcedimiento } = require("../config/procedimientos");

const origenes = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
const metodosLectura = new Set(["GET", "HEAD", "OPTIONS"]);

function verificarOrigen(req, res, next) {
  const origen = req.get("Origin");
  if (!metodosLectura.has(req.method) && (req.get("Sec-Fetch-Site") === "cross-site" ||
      (origen && !origenes.has(origen)))) {
    return res.status(403).json({ estado: "ERROR", mensaje: "Origen de solicitud no permitido" });
  }
  next();
}

async function verificarSesion(req, res, next) {
  const usuario = req.session?.usuario;
  if (!usuario || (req.method === "POST" && req.path === "/auth/logout")) return next();
  res.set("Cache-Control", "no-store");
  let conexion;
  let vigente = false;
  try {
    if (typeof req.session.versionCuenta === "string") {
      conexion = await obtenerConexion();
      const [cuenta] = await consultarProcedimiento(conexion, "SAB_API_VERSION_SESION", { actorId: usuario.id, rol: usuario.rol });
      vigente = cuenta?.VERSION_CUENTA === req.session.versionCuenta;
    }
  } catch (error) {
    console.error("Error verificando sesión:", error.code);
    return res.status(503).json({ estado: "ERROR", mensaje: "No se pudo verificar la sesión" });
  } finally {
    if (conexion) {
      try { await conexion.close(); } catch (error) { console.error("Error cerrando verificación:", error.code); }
    }
  }
  if (vigente) return next();
  req.session.destroy((error) => {
    if (error) console.error("Error descartando sesión:", error.code);
    res.clearCookie("sabotino.sid", { path: "/" });
    res.status(401).json({ autenticado: false, mensaje: "Vuelve a iniciar sesión" });
  });
}

module.exports = { verificarOrigen, verificarSesion };
