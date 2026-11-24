
require("dotenv").config();

const oracledb = require("oracledb");

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

    const resultado = await conexion.execute(
      `SELECT USER AS USUARIO,
              (SELECT COUNT(*) FROM USER_TABLES) AS TOTAL_TABLAS
       FROM DUAL`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log("Usuario conectado:", resultado.rows[0].USUARIO);
    console.log("Tablas disponibles:", resultado.rows[0].TOTAL_TABLAS);

  } catch (error) {
    console.error("Error al conectar con Oracle:");
    console.error(error.message);

  } finally {
    if (conexion) {
      await conexion.close();
      console.log("Conexión cerrada correctamente.");
    }
  }
}

probarConexion();
