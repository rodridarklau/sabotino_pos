const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const express = require("express");
const argon2 = require("argon2");
const db = require("../src/config/database");

let servidor;
let url;
let rol;
let llamadas;
let errorOracle;

before(async () => {
  const original = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      llamadas.push({ sql, binds });
      if (sql.startsWith("BEGIN")) {
        if (errorOracle) throw { errorNum: errorOracle };
        return { outBinds: { resultado: 9 } };
      }
      if (sql.startsWith("SELECT R.NOMBRE_ROL")) return { rows: [{ NOMBRE_ROL: rol }] };
      if (sql.startsWith("SELECT U.ID_ROL")) return { rows: binds.id === 8 ? [{ ID_ROL: 3 }] : [] };
      if (sql.startsWith("SELECT U.ID_USUARIO FROM")) return { rows: binds.vendedorId === 8 ? [{ ID_USUARIO: 8 }] : [] };
      if (sql.startsWith("SELECT H.ID_HORARIO FROM")) return { rows: binds.id === 9 ? [{ ID_HORARIO: 9 }] : [] };
      assert.match(sql, /^SELECT/);
      return { rows: [] };
    },
    async close() {}
  });
  const router = require("../src/routes/vendedores.routes");
  db.obtenerConexion = original;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { usuario: { id: 7, rol } }; next(); });
  app.use(router);
  await new Promise((resolve) => { servidor = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
});

beforeEach(() => {
  llamadas = [];
  rol = "DUENO";
  errorOracle = null;
});

const cuenta = { rut: "12.345.678-9", nombre: "Usuario simulado", usuario: "simulado", estado: "S" };
const horario = { vendedorId: 8, cajaId: 1, dia: "LUNES", inicio: "09:00", fin: "12:30", estado: "S" };
const escribir = (ruta, method, datos) => fetch(url + ruta, {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos)
});
const escrituras = () => llamadas.filter(({ sql }) => sql.startsWith("BEGIN"));

test("el listado requiere dueño y consulta solo campos públicos de las cuentas", async () => {
  rol = "VENDEDOR";
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await escribir("", "POST", cuenta)).status, 403);
  rol = "DUENO";
  assert.equal((await fetch(url)).status, 200);
  assert.ok(llamadas.every(({ sql }) => !sql.includes("PASSWORD_HASH")));
});

test("crea vendedor únicamente con hash Argon2id y rol resuelto por Oracle", async () => {
  const password = "contraseña simulada";
  assert.equal((await escribir("", "POST", { ...cuenta, password })).status, 201);
  const [llamada] = escrituras();
  assert.match(llamada.sql, /^BEGIN SAB_C_USUARIO/);
  assert.equal(llamada.binds.actorId, 7);
  assert.equal(llamada.binds.rolId, null);
  assert.match(llamada.binds.hash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(llamada.binds.hash, password), true);
  assert.ok(!Object.values(llamada.binds).includes(password));
});

test("edita solo vendedores, conserva el rol y admite mantener o reemplazar la contraseña", async () => {
  assert.equal((await escribir("/7", "PUT", cuenta)).status, 404);
  assert.equal((await escribir("/8", "PUT", { ...cuenta, estado: "N", rolId: 1 })).status, 200);
  assert.equal(escrituras()[0].binds.rolId, 3);
  assert.equal(escrituras()[0].binds.hash, null);
  assert.equal((await escribir("/8", "PUT", { ...cuenta, password: "otra contraseña simulada" })).status, 200);
  assert.match(escrituras()[1].binds.hash, /^\$argon2id\$/);
});

test("valida horarios, ejecuta CRUD de asignaciones y traduce solapes Oracle", async () => {
  assert.equal((await escribir("/horarios", "POST", { ...horario, fin: "08:59" })).status, 400);
  assert.equal((await escribir("/horarios", "POST", { ...horario, vendedorId: 7 })).status, 404);
  assert.equal((await escribir("/horarios", "POST", horario)).status, 201);
  assert.equal((await escribir("/horarios/9", "PUT", { ...horario, estado: "N" })).status, 200);
  assert.equal((await escribir("/horarios/9", "DELETE", {})).status, 200);
  errorOracle = 20554;
  assert.equal((await escribir("/horarios", "POST", horario)).status, 409);
  assert.deepEqual(escrituras().map(({ sql }) => sql.split("(")[0]), [
    "BEGIN SAB_C_HORARIO_VENDEDOR", "BEGIN SAB_U_HORARIO_VENDEDOR",
    "BEGIN SAB_D_HORARIO_VENDEDOR", "BEGIN SAB_C_HORARIO_VENDEDOR"
  ]);
});
