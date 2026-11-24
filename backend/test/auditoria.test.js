const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const express = require("express");
const db = require("../src/config/database");

let servidor, url, version, errorCompra;
const llamadas = [];
before(async () => {
  const original = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      llamadas.push({ sql, binds });
      if (sql.includes("STANDARD_HASH")) return { rows: version === null ? [] : [[version]] };
      assert.match(sql, /SAB_COMPRA_MULTIPLE/);
      if (errorCompra) throw errorCompra;
      return { outBinds: { cantidadLineas: 2, totalCompra: 12.75 } };
    },
    async close() {}
  });
  const { verificarOrigen, verificarSesion } = require("../src/services/seguridad-sesion");
  const compras = require("../src/routes/compras.routes");
  db.obtenerConexion = original;
  const app = express();
  app.use(express.json(), verificarOrigen);
  app.use((req, res, next) => {
    req.session = { versionCuenta: "version-mock", usuario: { id: 7, rol: req.headers["x-rol"] || "DUENO" },
      destroy: (fin) => fin() };
    next();
  });
  app.use(verificarSesion);
  app.get("/sesion", (req, res) => res.sendStatus(200));
  app.use("/compras", compras);
  await new Promise((resolve) => { servidor = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => { if (servidor) await new Promise((resolve) => servidor.close(resolve)); });

test("revoca sesiones desactivadas y sesiones anteriores al cambio de contraseña", async () => {
  for (const valor of [null, "otra-version"]) {
    version = valor;
    const r = await fetch(url + "/sesion");
    assert.equal(r.status, 401);
    assert.match(r.headers.get("set-cookie"), /^sabotino.sid=/);
  }
  version = "version-mock";
  assert.equal((await fetch(url + "/sesion")).status, 200);
});

test("compra múltiple enlaza un lote con proveedores distintos y distingue un resultado incierto", async () => {
  version = "version-mock";
  const articulos = [
    { tipo: "PRODUCTO", id_articulo: 2, id_proveedor: 1, cantidad: 1, costo_unitario: 5 },
    { tipo: "INSUMO", id_articulo: 3, id_proveedor: 8, cantidad: 1.55, costo_unitario: 5 }
  ];
  const enviar = (lista = articulos, headers = {}) => fetch(url + "/compras", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ articulos: lista })
  });
  assert.equal((await enviar(articulos, { "x-rol": "VENDEDOR" })).status, 403);
  assert.equal((await enviar([{ ...articulos[0], cantidad: true }])).status, 400);
  assert.equal((await enviar(articulos, { Origin: "https://otro.example" })).status, 403);
  assert.equal(llamadas.filter(({ sql }) => sql.includes("SAB_COMPRA_MULTIPLE")).length, 0);
  const registrada = await enviar();
  assert.equal(registrada.status, 201);
  assert.equal((await registrada.json()).totalCompra, 12.75);
  assert.deepEqual(JSON.parse(llamadas.at(-1).binds.articulosJson.val), articulos);
  assert.equal(llamadas.at(-1).binds.actorId, 7);
  errorCompra = { errorNum: 20185 };
  assert.equal((await enviar()).status, 400);
  errorCompra = { code: "NJS-500" };
  const incierta = await enviar();
  assert.equal(incierta.status, 503);
  assert.equal((await incierta.json()).estado, "INCIERTO");
  assert.equal(llamadas.filter(({ sql }) => sql.includes("SAB_COMPRA_MULTIPLE")).length, 3);
});
