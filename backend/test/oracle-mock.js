const assert = require("node:assert/strict");
const oracledb = require("oracledb");

function nombreProcedimiento(llamada) {
  const [ , nombre] = /^BEGIN (SAB_[A-Z0-9_]+)\([^)]*\); END;$/.exec(llamada) ?? [];
  assert.ok(nombre, "Se esperaba una llamada a un procedimiento de Oracle");
  return nombre;
}

function cursor(filas) {
  let posicion = 0;
  return { outBinds: { resultado: {
    async getRows(limite) {
      const lote = filas.slice(posicion, posicion + limite);
      posicion += lote.length;
      return lote;
    },
    async close() {}
  } } };
}

function sinCursor(binds) {
  if (binds.resultado?.type !== oracledb.CURSOR) return binds;
  const { resultado, ...entrada } = binds;
  return entrada;
}

module.exports = { cursor, nombreProcedimiento, sinCursor };
