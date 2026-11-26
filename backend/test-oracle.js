
require("dotenv").config();

const oracledb = require("oracledb");
const { consultarProcedimiento } = require("./src/config/procedimientos");

async function probarConexion() {
  let conexion;

  try {
    console.log("Intentando conectar con Oracle 21c...");

    conexion = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING
    });

    console.log("¡Conexión con Oracle exitosa!");

    const [diagnostico] = await consultarProcedimiento(conexion, "SAB_API_TOTAL_TABLAS");

    console.log("Usuario conectado:", diagnostico.USUARIO);
    console.log("Tablas disponibles:", diagnostico.TOTAL_TABLAS);

  } catch (error) {
    console.error("Error al conectar con Oracle:");
    console.error(error.message);
    process.exitCode = 1;

  } finally {
    if (conexion) {
      await conexion.close();
      console.log("Conexión cerrada correctamente.");
    }
  }
}

probarConexion();
