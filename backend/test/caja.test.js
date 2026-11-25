const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const express = require("express");
const oracledb = require("oracledb");
const db = require("../src/config/database");

let servidor;
let url;
let llamadas;
let escenario;

before(async () => {
  const original = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      llamadas.push({ sql, binds });
      const nombre = /^BEGIN (SAB_[A-Z_]+)\(/.exec(sql)?.[1];
      if (nombre) {
        if (nombre === "SAB_C_CAJA_TERMINAL") {
          escenario.caja = { ID_CAJA: 17, NOMBRE_CAJA: "MAIN", ESTADO_OPERATIVO: "S" };
          if (escenario.duplicado) throw { errorNum: 1 };
          return { outBinds: { resultado: 17 } };
        }
        if (nombre === "SAB_CERRAR_CAJA" && escenario.espera) await escenario.espera;
        if (escenario.error) throw escenario.error;
        const valor = { SAB_ABRIR_CAJA: 8, SAB_CERRAR_CAJA: -2.25, SAB_C_CAJA_TERMINAL: 3 }[nombre];
        return { outBinds: { resultado: valor } };
      }
      if (sql.startsWith("SELECT R.NOMBRE_ROL")) return { rows: [{ NOMBRE_ROL: escenario.rol }] };
      if (sql.includes("FROM CAJA_TERMINAL WHERE NOMBRE_CAJA")) {
        assert.equal(binds.nombre, "MAIN");
        return { rows: escenario.caja ? [escenario.caja] : [] };
      }
      if (sql.includes("FROM TURNO_CAJA T JOIN")) {
        const turnos = [{ ID_TURNO_CAJA: 8, ESTADO_TURNO: "ABIERTO" },
          { ID_TURNO_CAJA: 9, ESTADO_TURNO: "CERRADO", CIERRE_REAL_EFECTIVO: 10 }];
        return { rows: turnos.filter((turno) => {
          if (binds.turnoId) return turno.ID_TURNO_CAJA === binds.turnoId;
          return turno.ESTADO_TURNO === (sql.includes("AND T.ESTADO_TURNO = 'CERRADO'") ? "CERRADO" : "ABIERTO");
        }) };
      }
      if (sql.includes("FROM METODO_PAGO")) return { rows: [{ NOMBRE_METODO: "EFECTIVO", TOTAL: 12.5 }] };
      if (sql.includes("COUNT(*) AS BORRADORES")) return { rows: [{ BORRADORES: 1 }] };
      if (sql.includes("COUNT(*) AS CANTIDAD")) return { rows: [{ CANTIDAD: 1, TOTAL: 12.5 }] };
      if (sql.includes("FROM VENTA V")) return { rows: [{ ID_VENTA: 10, TOTAL_VENTA: 12.5 }] };
      if (sql.includes("FROM LOG_AUDITORIA_CAJA")) return { rows: [{ ID_LOG_CAJA: 1, TIPO_OPERACION: "APERTURA" }] };
      assert.fail(`SQL inesperado: ${sql}`);
    },
    async close() {}
  });
  const { router } = require("../src/routes/caja.routes");
  const ventas = require("../src/routes/ventas.routes");
  db.obtenerConexion = original;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { usuario: escenario.usuario }; next(); });
  app.use("/caja", router);
  app.use("/ventas", ventas);
  await new Promise((resolve) => { servidor = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  if (servidor) await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  llamadas = [];
  escenario = { usuario: { id: 7, rol: "VENDEDOR" }, rol: "VENDEDOR",
    caja: { ID_CAJA: 17, NOMBRE_CAJA: "MAIN", ESTADO_OPERATIVO: "S" } };
});

const salida = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
const escrituras = () => llamadas.filter(({ sql }) => sql.startsWith("BEGIN"));
const leer = (ruta) => fetch(url + ruta);
const enviar = (ruta, datos, method = "POST") => fetch(url + ruta, {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos)
});
const cierre = { efectivo: 12.5, tarjeta: 0, transferencia: 1.25 };
const cerrar = (datos = cierre) => enviar("/caja/turnos/8/cierre", datos);
const caja = { nombre: " Principal ", ubicacion: " Mostrador ", estado: "S" };

test("consulta terminales, activos, historial, pagos y ventas con alcance por rol", async () => {
  const catalogo = await (await leer("/caja")).json();
  assert.equal(catalogo.caja.ID_CAJA, 17);
  assert.equal(catalogo.activos[0].ID_TURNO_CAJA, 8);
  const historial = await (await leer("/caja/turnos?cajaId=1&pagina=2")).json();
  assert.equal(historial.turnos[0].CIERRE_REAL_EFECTIVO, 10);
  assert.deepEqual(llamadas.at(-1).binds, { actorId: 7, dueno: 0, cajaId: 1, desplazamiento: 25 });
  const detalle = await (await leer("/caja/turnos/8")).json();
  assert.deepEqual([detalle.pagos.length, detalle.ventas.length, detalle.auditoria.length, detalle.borradores], [1, 1, 1, 1]);
  const consultaPagos = llamadas.find(({ sql }) => sql.includes("FROM METODO_PAGO"));
  assert.match(consultaPagos.sql, /ESTADO_VENTA = 'CONFIRMADA'/);
  const consultaVentas = llamadas.find(({ sql }) => sql.startsWith("SELECT V.ID_VENTA"));
  assert.match(consultaVentas.sql, /V.ID_USUARIO = :actorId/);
  assert.equal(consultaVentas.binds.dueno, 0);
  assert.equal((await leer("/caja/turnos/99")).status, 404);
  assert.equal(escrituras().length, 0);
});

test("valida sesión y rol antes de permitir administrar terminales", async () => {
  escenario.usuario = null;
  assert.equal((await leer("/caja")).status, 401);
  escenario.usuario = { id: 7, rol: "VENDEDOR" };
  assert.equal((await enviar("/caja/terminales", caja)).status, 404);
  escenario.usuario.rol = "DUENO";
  assert.equal((await cerrar()).status, 403);
  assert.deepEqual(escrituras(), []);
});

test("Caja y Ventas comparten la apertura con el actor de la sesión", async () => {
  assert.equal((await enviar("/caja/turnos", { cajaId: 1, efectivoInicial: 0.001 })).status, 400);
  for (const ruta of ["/caja/turnos", "/ventas/turnos"]) {
    const respuesta = await enviar(ruta, { actorId: 99, efectivoInicial: 20.5 });
    assert.equal(respuesta.status, 201);
    assert.deepEqual(await respuesta.json(), { turnoId: 8 });
  }
  assert.equal(escrituras().length, 2);
  for (const llamada of escrituras()) {
    assert.deepEqual(llamada, {
      sql: "BEGIN SAB_ABRIR_CAJA(:actorId, :cajaId, :efectivoInicial, :resultado); END;",
      binds: { actorId: 7, cajaId: 17, efectivoInicial: 20.5, resultado: salida }
    });
  }
  assert.equal((await enviar("/caja/turnos", { cajaId: 1, efectivoInicial: 0 })).status, 409);
  assert.equal(escrituras().length, 2);
  escenario.error = { errorNum: 20104 };
  assert.equal((await enviar("/caja/turnos", { efectivoInicial: 0 })).status, 409);
});

test("pasa los tres importes reales al cierre y usa el descuadre de Oracle", async () => {
  for (const datos of [{ efectivo: 1 }, { ...cierre, efectivo: -1 }, { ...cierre, tarjeta: 0.001 }, { ...cierre, transferencia: "1" }]) {
    assert.equal((await cerrar(datos)).status, 400);
  }
  const respuesta = await cerrar({ ...cierre, actorId: 99 });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { turnoId: 8, descuadre: -2.25 });
  assert.deepEqual(escrituras(), [{
    sql: "BEGIN SAB_CERRAR_CAJA(:actorId, :turnoId, :efectivo, :tarjeta, :transferencia, :resultado); END;",
    binds: { actorId: 7, turnoId: 8, ...cierre, resultado: salida }
  }]);
});

test("traduce borradores pendientes, turno cerrado y respuesta incierta sin reintentos", async () => {
  for (const [errorNum, texto] of [[20142, /cerrado/], [20143, /borrador/]]) {
    escenario.error = { errorNum };
    const respuesta = await cerrar();
    assert.equal(respuesta.status, 409);
    assert.match((await respuesta.json()).mensaje, texto);
  }
  escenario.error = { code: "NJS-500" };
  const respuesta = await cerrar();
  assert.equal(respuesta.status, 503);
  assert.equal((await respuesta.json()).estado, "INCIERTO");
  assert.equal(escrituras().length, 3);
});

test("bloquea cierres y otras escrituras simultáneas del mismo usuario", async () => {
  let liberar;
  escenario.espera = new Promise((resolve) => { liberar = resolve; });
  const primera = cerrar();
  try {
    for (let intento = 0; intento < 100 && !escrituras().length; intento += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(escrituras().length, 1);
    assert.equal((await cerrar()).status, 409);
    assert.equal((await enviar("/ventas/turnos", { cajaId: 1, efectivoInicial: 0 })).status, 409);
    assert.equal(escrituras().length, 1);
  } finally {
    liberar();
    assert.equal((await primera).status, 200);
  }
});

test("crea MAIN solo como dueño, recupera una creación concurrente y reutiliza el ID real", async () => {
  escenario.caja = null;
  assert.equal((await enviar("/caja/turnos", { efectivoInicial: 0 })).status, 409);
  assert.equal(escrituras().length, 0);
  escenario.usuario.rol = escenario.rol = "DUENO";
  escenario.duplicado = true;
  assert.equal((await enviar("/caja/turnos", { efectivoInicial: 0 })).status, 201);
  assert.equal((await enviar("/ventas/turnos", { efectivoInicial: 0 })).status, 201);
  const [crear, ...abrir] = escrituras();
  assert.deepEqual(crear.binds, { actorId: 7, nombre: "MAIN", ubicacion: null, estado: "S", resultado: salida });
  assert.deepEqual(abrir.map(({ binds }) => binds.cajaId), [17, 17]);
  for (const [ruta, metodo] of [["/caja/terminales", "POST"], ["/caja/terminales/17", "PUT"], ["/caja/terminales/17", "DELETE"]]) {
    assert.equal((await enviar(ruta, caja, metodo)).status, 404);
  }
});
