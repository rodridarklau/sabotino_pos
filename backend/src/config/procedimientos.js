const oracledb = require("oracledb");

const numeroSalida = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
const cursorSalida = { dir: oracledb.BIND_OUT, type: oracledb.CURSOR };
const opciones = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function entradaClob(val) {
  return { val, type: oracledb.DB_TYPE_CLOB, dir: oracledb.BIND_IN };
}

async function ejecutarProcedimiento(conexion, nombre, binds = {}) {
  const parametros = Object.keys(binds);
  if (!/^SAB_[A-Z0-9_]+(?:\.[A-Z][A-Z0-9_]*)?$/.test(nombre) ||
      parametros.some((parametro) => !/^[a-z][a-zA-Z0-9]*$/.test(parametro))) {
    throw new Error("Invocación Oracle no válida");
  }
  const argumentos = parametros.map((parametro) => ":" + parametro).join(", ");
  const { outBinds = {} } = await conexion.execute("BEGIN " + nombre + "(" + argumentos + "); END;", binds, opciones);
  const cursores = parametros.filter((parametro) => binds[parametro]?.type === oracledb.CURSOR);
  const resultadosOriginales = cursores.map((parametro) => outBinds[parametro]).filter(Boolean);
  let errorLectura;
  try {
    for (const parametro of cursores) {
      const cursor = outBinds[parametro];
      if (!cursor) throw new Error("Cursor de Oracle no disponible: " + parametro);
      const filas = [];
      for (let lote = await cursor.getRows(200); lote.length; lote = await cursor.getRows(200)) {
        for (const fila of lote) filas.push(fila);
        if (lote.length < 200) break;
      }
      outBinds[parametro] = filas;
    }
  } catch (error) {
    errorLectura = error;
    throw error;
  } finally {
    let errorCierre;
    for (const cursor of resultadosOriginales) {
      try { await cursor.close(); } catch (error) { errorCierre ??= error; }
    }
    if (!errorLectura && errorCierre) throw errorCierre;
  }
  return outBinds;
}

async function consultarProcedimiento(conexion, nombre, binds = {}) {
  const { resultado } = await ejecutarProcedimiento(conexion, nombre, { ...binds, resultado: cursorSalida });
  return resultado;
}

module.exports = { ejecutarProcedimiento, consultarProcedimiento, entradaClob, numeroSalida, cursorSalida };
