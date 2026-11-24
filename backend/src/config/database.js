
const oracledb = require("oracledb");

// Crear un conjunto reutilizable de conexiones Oracle.
async function iniciarBaseDatos() {
  await oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1
  });

  console.log("Pool de conexiones Oracle iniciado correctamente.");
}

// Obtener una conexión disponible del pool.
async function obtenerConexion() {
  return await oracledb.getConnection();
}

module.exports = {
  iniciarBaseDatos,
  obtenerConexion
};
