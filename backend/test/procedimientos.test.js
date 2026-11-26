const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ejecutarProcedimiento, consultarProcedimiento, cursorSalida } = require("../src/config/procedimientos");

test("lee y cierra el cursor incluso si tiene más de un lote", async () => {
  const esperadas = Array.from({ length: 405 }, (_, ID) => ({ ID }));
  let posicion = 0;
  let cerrado = false;
  const conexion = {
    async execute(plsql, binds) {
      assert.equal(plsql, "BEGIN SAB_API_REP_FILTRO_PRODUCTO(:actorId, :resultado); END;");
      assert.equal(binds.actorId, 7);
      assert.equal(binds.resultado, cursorSalida);
      return { outBinds: { resultado: {
        async getRows(cantidad) {
          const lote = esperadas.slice(posicion, posicion + cantidad);
          posicion += lote.length;
          return lote;
        },
        async close() { cerrado = true; }
      } } };
    }
  };
  assert.deepEqual(await consultarProcedimiento(conexion, "SAB_API_REP_FILTRO_PRODUCTO", { actorId: 7 }), esperadas);
  assert.equal(cerrado, true);
});

test("cierra todos los cursores y conserva el error de lectura", async () => {
  const cerrados = [];
  const falloLectura = new Error("lectura fallida");
  const conexion = {
    async execute() {
      return { outBinds: {
        primero: {
          async getRows() { throw falloLectura; },
          async close() { cerrados.push("primero"); throw new Error("cierre fallido"); }
        },
        segundo: { async close() { cerrados.push("segundo"); } }
      } };
    }
  };
  await assert.rejects(ejecutarProcedimiento(conexion, "SAB_API_PRUEBA", {
    primero: cursorSalida, segundo: cursorSalida
  }), (error) => error === falloLectura);
  assert.deepEqual(cerrados, ["primero", "segundo"]);
});

test("solo admite nombres de procedimientos y parámetros válidos", async () => {
  const conexion = { execute() { assert.fail("Se invocó el driver"); } };
  await assert.rejects(ejecutarProcedimiento(conexion, "SELECT 1 FROM DUAL"), /Invocación Oracle no válida/);
  await assert.rejects(ejecutarProcedimiento(conexion, "SAB_API_PRUEBA", { "parámetro incorrecto": 1 }), /Invocación Oracle no válida/);
});
