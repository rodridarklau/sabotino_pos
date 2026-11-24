require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const oracledb = require("oracledb");

const { iniciarBaseDatos, obtenerConexion } = require("./src/config/database");
const productosRoutes = require("./src/routes/productos.routes");
const authRoutes = require("./src/routes/auth.routes");
const comprasRoutes = require("./src/routes/compras.routes");
const inventarioRoutes = require("./src/routes/inventario.routes");
const ventasRoutes = require("./src/routes/ventas.routes");
const vendedoresRoutes = require("./src/routes/vendedores.routes");
const reportesRoutes = require("./src/routes/reportes.routes");
const { router: imagenesProductosRoutes } = require("./src/routes/imagenes-productos.routes");
const { verificarOrigen, verificarSesion } = require("./src/services/seguridad-sesion");
const { router: cajaRoutes } = require("./src/routes/caja.routes");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors({ origin: "http://localhost:5173" }));
app.use("/api", verificarOrigen);
app.use(express.json({ limit: "200kb" }));

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("Falta configurar SESSION_SECRET en .env");
}

app.use(session({
  name: "sabotino.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Solo desarrollo local HTTP. En producción: HTTPS y secure:true.
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// Mantener las rutas de autenticación antes de las protegidas.
app.use("/api", verificarSesion);
app.use("/api/auth", authRoutes);
app.use("/api/compras", comprasRoutes);
app.use("/api/inventario", inventarioRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/vendedores", vendedoresRoutes);
app.use("/api/reportes", reportesRoutes);
app.use("/api/inicio", require("./src/routes/inicio.routes"));
app.use("/api/productos-imagenes", imagenesProductosRoutes);
app.use("/api/caja", cajaRoutes);
app.use("/api", productosRoutes);

app.get("/api/health", (req, res) => {
  res.json({ estado: "OK", mensaje: "Backend de SABOTINO funcionando correctamente" });
});

app.get("/api/oracle", async (req, res) => {
  let conexion;
  try {
    conexion = await obtenerConexion();
    const resultado = await conexion.execute(
      "SELECT COUNT(*) AS TOTAL_TABLAS FROM USER_TABLES", [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({
      estado: "OK", baseDatos: "Oracle 21c", conexion: "Exitosa",
      totalTablas: resultado.rows[0].TOTAL_TABLAS
    });
  } catch (error) {
    console.error("Error consultando Oracle:", error.message);
    res.status(500).json({ estado: "ERROR", mensaje: "No se pudo consultar la base de datos" });
  } finally {
    if (conexion) await conexion.close();
  }
});

async function iniciarServidor() {
  try {
    await iniciarBaseDatos();
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`SABOTINO funcionando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("No se pudo iniciar SABOTINO:", error.message);
    process.exitCode = 1;
  }
}

iniciarServidor();
