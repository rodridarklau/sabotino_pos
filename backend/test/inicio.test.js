const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const express = require("express");
const db = require("../src/config/database");

let servidor;
let url;
let consultas;
let usuario;
let rolOracle;
let fallaVentas;

before(async () => {
  const original = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      assert.match(sql, /^SELECT /);
      consultas.push({ sql, binds });
      if (sql.includes("FROM USUARIO U")) return { rows: [{ NOMBRE_ROL: rolOracle }] };
      if (sql.includes("FROM VENTA V")) {
        if (fallaVentas) throw new Error("Lectura simulada no disponible");
        return { rows: [{ CANTIDAD: 1, TOTAL: 655.25 }] };
      }
      if (sql.includes("FROM TURNO_CAJA")) return { rows: [] };
      if (sql.includes("FROM PRODUCTO P")) return { rows: [{ ID_PRODUCTO: 4 }] };
      assert.fail("Consulta inesperada");
    },
    async close() {}
  });
  const inicio = require("../src/routes/inicio.routes");
  db.obtenerConexion = original;
  const app = express();
  app.use((req, res, next) => { req.session = { usuario }; next(); });
  app.use("/api/inicio", inicio);
  await new Promise((resolve) => { servidor = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${servidor.address().port}/api/inicio`;
});
after(() => servidor?.close());

function contexto(rol) {
  consultas = [];
  usuario = rol && { id: 27, rol };
  rolOracle = rol;
  fallaVentas = false;
}

test("dueño: totales confirmados sin pagos, día de Santiago y alertas reales", async () => {
  contexto("DUENO");
  const respuesta = await fetch(url);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get("cache-control"), "no-store");
  const datos = await respuesta.json();
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  assert.equal(datos.hoy, partes.filter(({ type }) => type !== "literal").map(({ value }) => value).join("-"));
  assert.deepEqual(datos.ventas, { CANTIDAD: 1, TOTAL: 655.25 });
  assert.deepEqual(datos.alertas, [{ ID_PRODUCTO: 4 }]);
  assert.match(consultas[1].sql, /ESTADO_VENTA = 'CONFIRMADA'/);
  assert.match(consultas[1].sql, /INTERVAL '1' DAY/);
  assert.doesNotMatch(consultas[1].sql, /PAGO_VENTA/);
  assert.match(consultas[3].sql, /P\.STOCK_ACTUAL <= P\.STOCK_CRITICO/);
});

test("vendedor: ventas y turnos propios, sin lectura administrativa", async () => {
  contexto("VENDEDOR");
  const respuesta = await fetch(url);
  assert.equal(respuesta.status, 200);
  assert.equal(Object.hasOwn(await respuesta.json(), "alertas"), false);
  assert.equal(consultas.length, 3);
  assert.deepEqual(consultas[2].binds, { actorId: 27, dueno: 0 });
  assert.equal(consultas[1].binds.dueno, 0);
  assert.equal(consultas[1].binds.actorId, 27);
  assert.match(consultas[1].sql, /V\.ID_USUARIO = :actorId/);
  assert.match(consultas[2].sql, /T\.ID_USUARIO_APERTURA = :actorId/);
});

test("una lectura fallida conserva las demás; un vacío válido queda diferenciado", async () => {
  contexto("DUENO");
  fallaVentas = true;
  const respuesta = await fetch(url);
  assert.equal(respuesta.status, 200);
  const datos = await respuesta.json();
  assert.equal(datos.ventas, null);
  assert.deepEqual(datos.turnos, []);
  assert.equal(datos.alertas.length, 1);
});

test("rechaza sesiones ausentes y roles revocados", async () => {
  contexto(null);
  assert.equal((await fetch(url)).status, 401);
  assert.equal(consultas.length, 0);
  contexto("ADMIN");
  assert.equal((await fetch(url)).status, 403);
  assert.equal(consultas.length, 0);
  contexto("DUENO");
  rolOracle = "VENDEDOR";
  assert.equal((await fetch(url)).status, 403);
  assert.equal(consultas.length, 1);
});
