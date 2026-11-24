const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const express = require("express");
const oracledb = require("oracledb");
const database = require("../src/config/database");

let servidor;
let url;
let llamadas;
let cerradas;
let escenario;

before(async () => {
  const obtenerConexion = database.obtenerConexion;
  database.obtenerConexion = async () => ({
    async execute(sql, binds) {
      llamadas.push({ sql, binds });
      if (sql.includes("SAB_F_ES_DUENO")) return { rows: [{ PERMITIDO: escenario.permitido }] };
      if (sql.includes("FROM TIPO_AJUSTE_STOCK")) return { rows: escenario.tipos };
      if (sql.includes("FROM PRODUCTO")) return { rows: escenario.productos };
      if (sql.includes("FROM INSUMO")) return { rows: escenario.insumos };
      if (sql.includes("FROM AJUSTE_INVENTARIO")) return { rows: escenario.historial };
      if (sql.startsWith("BEGIN SAB_AJUSTAR_STOCK")) {
        if (escenario.error) throw escenario.error;
        return { outBinds: { resultado: escenario.resultado } };
      }
      assert.fail(`SQL no previsto: ${sql}`);
    },
    async close() { cerradas += 1; }
  });
  const router = require("../src/routes/inventario.routes");
  database.obtenerConexion = obtenerConexion;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { usuario: escenario.usuario };
    next();
  });
  app.use("/api/inventario", router);
  await new Promise((resolve) => {
    servidor = app.listen(0, "127.0.0.1", resolve);
  });
  url = `http://127.0.0.1:${servidor.address().port}/api/inventario`;
});

after(async () => {
  if (servidor) await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  llamadas = [];
  cerradas = 0;
  escenario = {
    usuario: { id: 7, rol: "DUENO" },
    permitido: 1,
    productos: [{ ID_PRODUCTO: 3, PERMITE_DECIMALES: "N", STOCK_ACTUAL: 2 }],
    insumos: [{ ID_INSUMO: 3, PERMITE_DECIMALES: "S", STOCK_ACTUAL: 2.5 }],
    tipos: [{ ID_TIPO_AJUSTE: 8, FACTOR_OPERACION: -1 }],
    historial: [],
    resultado: 42
  };
});

function ajustar(datos = {}) {
  return fetch(`${url}/ajustes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipoArticulo: "PRODUCTO", articuloId: 3, tipoAjusteId: 8, cantidad: 1, ...datos
    })
  });
}

function escrituras() {
  return llamadas.filter(({ sql }) => sql.startsWith("BEGIN"));
}

test("consulta artículos, tipos y la siguiente página de historial", async () => {
  const respuesta = await fetch(url);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), {
    estado: "OK", productos: escenario.productos, insumos: escenario.insumos, tipos: escenario.tipos
  });
  escenario.historial = Array.from({ length: 51 }, (_, index) => ({ ID_AJUSTE: index }));
  const historial = await fetch(`${url}/historial?pagina=2`);
  assert.equal(historial.status, 200);
  const datos = await historial.json();
  assert.equal(datos.ajustes.length, 50);
  assert.equal(datos.hayMas, true);
  assert.deepEqual(llamadas.at(-1).binds, { desplazamiento: 50, limite: 51 });
  assert.equal((await fetch(`${url}/historial?pagina=0`)).status, 400);
  assert.equal(escrituras().length, 0);
  assert.equal(cerradas, 2);
});

test("rechaza usuarios sin sesión, vendedores y dueños cuya autorización caducó", async () => {
  const dueno = escenario.usuario;
  escenario.usuario = undefined;
  assert.equal((await ajustar()).status, 401);
  escenario.usuario = { id: 7, rol: "VENDEDOR" };
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await ajustar()).status, 403);
  assert.equal(llamadas.length, 0);
  escenario.usuario = dueno;
  escenario.permitido = 0;
  assert.equal((await fetch(`${url}/historial`)).status, 403);
  assert.equal((await ajustar()).status, 403);
  assert.equal(escrituras().length, 0);
});

test("producto usa seis binds, devuelve el ID y toma el actor de la sesión", async () => {
  const respuesta = await ajustar({ actorId: 100, observacion: "  Merma  " });
  assert.equal(respuesta.status, 201);
  assert.deepEqual(await respuesta.json(), { estado: "OK", idAjuste: 42 });
  assert.deepEqual(escrituras(), [{
    sql: "BEGIN SAB_AJUSTAR_STOCK(:actorId, :articuloId, :tipoAjusteId, :cantidad, :observacion, :resultado); END;",
    binds: { actorId: 7, articuloId: 3, tipoAjusteId: 8, cantidad: 1,
      observacion: "Merma", resultado: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
  }]);
  assert.equal(cerradas, 1);
});

test("insumo admite decimales, usa cinco binds y devuelve un stock que puede ser cero", async () => {
  escenario.resultado = 0;
  const respuesta = await ajustar({ tipoArticulo: "INSUMO", cantidad: 2.5 });
  assert.equal(respuesta.status, 201);
  assert.deepEqual(await respuesta.json(), { estado: "OK", nuevoStock: 0 });
  assert.deepEqual(escrituras(), [{
    sql: "BEGIN SAB_AJUSTAR_STOCK_INSUMO(:actorId, :articuloId, :tipoAjusteId, :cantidad, :resultado); END;",
    binds: { actorId: 7, articuloId: 3, tipoAjusteId: 8, cantidad: 2.5,
      resultado: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
  }]);
});

test("rechaza cantidad inválida, observación no admitida y saldo negativo antes de escribir", async () => {
  for (const cantidad of [0, -1, 1.0001, 1_000_000_000, "1", { valueOf: 1 }, 0.5]) {
    assert.equal((await ajustar({ cantidad })).status, 400);
  }
  assert.equal((await ajustar({ observacion: "á".repeat(126) })).status, 400);
  assert.equal((await ajustar({ tipoArticulo: "INSUMO", observacion: "Texto" })).status, 400);
  assert.equal((await ajustar({ cantidad: 3 })).status, 409);
  escenario.tipos = [];
  assert.equal((await ajustar()).status, 404);
  assert.equal(escrituras().length, 0);
});

test("permite ingresos por el factor de Oracle y conserva la observación opcional", async () => {
  escenario.tipos[0].FACTOR_OPERACION = 1;
  assert.equal((await ajustar({ cantidad: 3 })).status, 201);
  assert.equal(escrituras()[0].binds.observacion, null);
  assert.equal((await ajustar({ cantidad: 999999999 })).status, 409);
  assert.equal(escrituras().length, 1);
});

test("traduce saldo concurrente insuficiente y distingue una respuesta incierta", async () => {
  escenario.error = Object.assign(new Error("Saldo negativo"), { errorNum: 20153 });
  const conflicto = await ajustar();
  assert.equal(conflicto.status, 409);
  assert.equal((await conflicto.json()).estado, "ERROR");
  escenario.error = Object.assign(new Error("Conexión perdida"), { code: "NJS-500" });
  const incierto = await ajustar();
  assert.equal(incierto.status, 503);
  assert.equal((await incierto.json()).estado, "INCIERTO");
  assert.equal(escrituras().length, 2);
  assert.equal(cerradas, 2);
});
