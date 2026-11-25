const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const express = require("express");
const oracledb = require("oracledb");
const db = require("../src/config/database");

let servidor;
let url;
let escenario;
let llamadas;
let cierres;

before(async () => {
  const original = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      llamadas.push({ sql, binds });
      const nombre = /^BEGIN (SAB_[A-Z_]+)\(/.exec(sql)?.[1];
      if (nombre) {
        if (escenario.espera && nombre === "SAB_VENTA_CONFIRMAR") await escenario.espera;
        if (escenario.errores[nombre]) throw escenario.errores[nombre];
        const valor = { SAB_ABRIR_CAJA: 6, SAB_VENTA_INICIAR: 91, SAB_VENTA_CONFIRMAR: 15 }[nombre] ?? 44;
        return { outBinds: { resultado: valor } };
      }
      if (sql.startsWith("SELECT R.NOMBRE_ROL")) return { rows: escenario.rol ? [{ NOMBRE_ROL: escenario.rol }] : [] };
      if (sql.includes("FROM PRODUCTO P")) return { rows: escenario.productos };
      if (sql.includes("FROM METODO_PAGO")) return { rows: escenario.metodos };
      if (sql.includes("FROM CAJA_TERMINAL")) return { rows: [{ ID_CAJA: 2, NOMBRE_CAJA: "MAIN", ESTADO_OPERATIVO: "S" }] };
      if (sql.includes("FROM TURNO_CAJA")) {
        assert.equal(binds.nombre, "MAIN");
        return { rows: escenario.turnos.filter((turno) => !binds.turnoId || turno.ID_TURNO_CAJA === binds.turnoId) };
      }
      if (sql.includes("FROM VENTA V")) {
        return { rows: escenario.ventas.filter((v) =>
          (binds.dueno || v.ID_USUARIO === binds.actorId) && (!binds.ventaId || v.ID_VENTA === binds.ventaId)) };
      }
      if (sql.includes("FROM VENTA WHERE")) {
        return { rows: escenario.ventas.filter((v) => v.ID_VENTA === binds.ventaId && v.ID_USUARIO === binds.actorId) };
      }
      if (sql.includes("FROM DETALLE_VENTA")) return { rows: [{ ID_DETALLE_VENTA: 12 }] };
      if (sql.includes("FROM PAGO_VENTA")) return { rows: [{ ID_PAGO_VENTA: 21 }] };
      assert.fail(`SQL inesperado: ${sql}`);
    },
    async close() { cierres += 1; }
  });
  const ventas = require("../src/routes/ventas.routes");
  db.obtenerConexion = original;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { usuario: escenario.usuario }; next(); });
  app.use("/api/ventas", ventas);
  await new Promise((resolve) => { servidor = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${servidor.address().port}/api/ventas`;
});

after(async () => {
  if (servidor) await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  llamadas = [];
  cierres = 0;
  escenario = {
    usuario: { id: 7, rol: "VENDEDOR" }, rol: "VENDEDOR", errores: {},
    productos: [
      { ID_PRODUCTO: 1, NOMBRE_PRODUCTO: "Pan", STOCK_ACTUAL: 5, PERMITE_DECIMALES: "N", PRECIO_VENTA_ACTUAL: 10 },
      { ID_PRODUCTO: 2, NOMBRE_PRODUCTO: "Bizcochos", STOCK_ACTUAL: 4, PERMITE_DECIMALES: "S", PRECIO_VENTA_ACTUAL: 10 }
    ],
    metodos: [{ ID_METODO_PAGO: 1, REQUIERE_COMPROBANTE: "N" }, { ID_METODO_PAGO: 2, REQUIERE_COMPROBANTE: "S" }],
    turnos: [{ ID_TURNO_CAJA: 6 }],
    ventas: [
      { ID_VENTA: 91, ID_USUARIO: 7, ESTADO_VENTA: "BORRADOR" },
      { ID_VENTA: 92, ID_USUARIO: 9, ESTADO_VENTA: "CONFIRMADA" }
    ]
  };
});

const bindsSalida = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
const escritura = () => llamadas.filter(({ sql }) => /^BEGIN /.test(sql));
const nombres = () => escritura().map(({ sql }) => /^BEGIN (SAB_[A-Z_]+)/.exec(sql)[1]);
const post = (ruta, cuerpo) => fetch(url + ruta, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
});
const vender = (cambios = {}) => post("", {
  turnoId: 6, totalEsperado: 15,
  lineas: [{ productoId: 1, cantidad: 1 }, { productoId: 2, cantidad: 0.5 }],
  pagos: [{ metodoId: 1, monto: 5 }, { metodoId: 2, monto: 10, comprobante: "  T123  " }],
  ...cambios
});

test("los GET filtran por actor y permiten al dueño consultar otras ventas", async () => {
  const catalogos = await fetch(`${url}/catalogos`);
  assert.equal(catalogos.status, 200);
  const datos = await catalogos.json();
  assert.equal(datos.productos.length, 2);
  assert.equal(datos.metodos.length, 2);
  assert.equal(datos.turnos[0].ID_TURNO_CAJA, 6);
  const listado = await (await fetch(`${url}?pagina=2&estado=BORRADOR&buscar=91`)).json();
  assert.deepEqual(listado.ventas, [escenario.ventas[0]]);
  assert.deepEqual(llamadas.at(-1).binds, { actorId: 7, dueno: 0, desplazamiento: 25, estado: "BORRADOR", buscar: "91" });
  assert.equal((await fetch(`${url}/92`)).status, 404);
  const propio = await (await fetch(`${url}/91`)).json();
  assert.equal(propio.pagos[0].ID_PAGO_VENTA, 21);
  assert.equal(propio.detalles[0].ID_DETALLE_VENTA, 12);
  assert.equal(propio.puedeAnular, true);
  escenario.usuario.rol = escenario.rol = "DUENO";
  const ajeno = await (await fetch(`${url}/92`)).json();
  assert.equal(ajeno.venta.ID_VENTA, 92);
  assert.equal(ajeno.puedeAnular, false);
  assert.equal(escritura().length, 0);
});

test("confirma una venta con dos productos y pagos divididos usando los binds reales", async () => {
  const respuesta = await vender({ actorId: 99 });
  assert.equal(respuesta.status, 201);
  assert.deepEqual(await respuesta.json(), { ventaId: 91, total: 15 });
  assert.deepEqual(escritura(), [
    { sql: "BEGIN SAB_VENTA_INICIAR(:actorId, :turnoId, :resultado); END;", binds: { actorId: 7, turnoId: 6, resultado: bindsSalida } },
    { sql: "BEGIN SAB_VENTA_AGREGAR_PRODUCTO(:actorId, :ventaId, :productoId, :cantidad, :resultado); END;", binds: { actorId: 7, ventaId: 91, productoId: 1, cantidad: 1, resultado: bindsSalida } },
    { sql: "BEGIN SAB_VENTA_AGREGAR_PRODUCTO(:actorId, :ventaId, :productoId, :cantidad, :resultado); END;", binds: { actorId: 7, ventaId: 91, productoId: 2, cantidad: 0.5, resultado: bindsSalida } },
    { sql: "BEGIN SAB_VENTA_AGREGAR_PAGO(:actorId, :ventaId, :metodoId, :monto, :comprobante, :resultado); END;", binds: { actorId: 7, ventaId: 91, metodoId: 1, monto: 5, comprobante: null, resultado: bindsSalida } },
    { sql: "BEGIN SAB_VENTA_AGREGAR_PAGO(:actorId, :ventaId, :metodoId, :monto, :comprobante, :resultado); END;", binds: { actorId: 7, ventaId: 91, metodoId: 2, monto: 10, comprobante: "T123", resultado: bindsSalida } },
    { sql: "BEGIN SAB_VENTA_CONFIRMAR(:actorId, :ventaId, :resultado); END;", binds: { actorId: 7, ventaId: 91, resultado: bindsSalida } }
  ]);
  assert.equal(cierres, 1);
});

test("valida sesión, stock, unidad, duplicados, comprobantes, totales y turno antes de escribir", async () => {
  const actor = escenario.usuario;
  escenario.usuario = null;
  assert.equal((await vender()).status, 401);
  escenario.usuario = actor;
  escenario.rol = null;
  assert.equal((await vender()).status, 403);
  escenario.rol = "VENDEDOR";
  assert.equal((await vender({ lineas: [{ productoId: 1, cantidad: 0.5 }] })).status, 400);
  assert.equal((await vender({ lineas: [{ productoId: 1, cantidad: 6 }] })).status, 409);
  assert.equal((await vender({ lineas: [{ productoId: 1, cantidad: 1 }, { productoId: 1, cantidad: 1 }] })).status, 400);
  assert.equal((await vender({ pagos: [{ metodoId: 2, monto: 15 }] })).status, 400);
  assert.equal((await vender({ totalEsperado: 16 })).status, 409);
  escenario.turnos = [];
  assert.equal((await vender()).status, 409);
  assert.deepEqual(nombres(), []);
});

test("paga el subtotal redondeado por línea y admite venta de importe cero sin pagos", async () => {
  escenario.productos[1].PRECIO_VENTA_ACTUAL = 0.01;
  assert.equal((await vender({
    lineas: [{ productoId: 2, cantidad: 0.5 }], totalEsperado: 0.01, pagos: [{ metodoId: 1, monto: 0.01 }]
  })).status, 201);
  escenario.productos[1].PRECIO_VENTA_ACTUAL = 0;
  const anteriores = escritura().length;
  assert.equal((await vender({ lineas: [{ productoId: 2, cantidad: 0.5 }], totalEsperado: 0, pagos: [] })).status, 201);
  assert.deepEqual(nombres().slice(anteriores), ["SAB_VENTA_INICIAR", "SAB_VENTA_AGREGAR_PRODUCTO", "SAB_VENTA_CONFIRMAR"]);
});

test("un rechazo conocido en confirmación anula el borrador con el procedimiento de Oracle", async () => {
  escenario.errores.SAB_VENTA_CONFIRMAR = { errorNum: 20128 };
  const respuesta = await vender();
  assert.equal(respuesta.status, 409);
  assert.deepEqual(await respuesta.json(), { estado: "ERROR", mensaje: "Stock insuficiente. Actualiza el catálogo", ventaId: 91, anulada: true });
  assert.equal(nombres().at(-1), "SAB_VENTA_CANCELAR");
  assert.deepEqual(escritura().at(-1).binds, { actorId: 7, ventaId: 91 });
});

test("una respuesta incierta no reintenta ni anula una posible confirmación", async () => {
  escenario.errores.SAB_VENTA_CONFIRMAR = { code: "NJS-500" };
  const respuesta = await vender();
  assert.equal(respuesta.status, 503);
  const datos = await respuesta.json();
  assert.equal(datos.estado, "INCIERTO");
  assert.equal(datos.ventaId, 91);
  assert.equal(nombres().at(-1), "SAB_VENTA_CONFIRMAR");
  escenario.errores = { SAB_VENTA_AGREGAR_PAGO: { errorNum: 20120 }, SAB_VENTA_CANCELAR: { code: "NJS-500" } };
  assert.equal((await (await vender()).json()).estado, "INCIERTO");
});

test("bloquea dos solicitudes simultáneas del mismo actor", async () => {
  let liberar;
  escenario.espera = new Promise((resolve) => { liberar = resolve; });
  const primera = vender();
  try {
    for (let i = 0; i < 100 && !nombres().includes("SAB_VENTA_CONFIRMAR"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(nombres().includes("SAB_VENTA_CONFIRMAR"));
    const segunda = await vender();
    assert.equal(segunda.status, 409);
    assert.equal((await segunda.json()).estado, "INCIERTO");
    assert.equal(nombres().filter((n) => n === "SAB_VENTA_INICIAR").length, 1);
  } finally {
    liberar();
    assert.equal((await primera).status, 201);
  }
});

test("abre caja y recupera borradores propios con las firmas existentes", async () => {
  assert.equal((await post("/turnos", { cajaId: 2, efectivoInicial: 0.001 })).status, 400);
  const abierta = await post("/turnos", { cajaId: 2, efectivoInicial: 10.5 });
  assert.equal(abierta.status, 201);
  assert.deepEqual(await abierta.json(), { turnoId: 6 });
  assert.equal((await post("/92/anulacion", {})).status, 404);
  assert.equal((await post("/91/anulacion", {})).status, 200);
  assert.deepEqual(escritura(), [
    { sql: "BEGIN SAB_ABRIR_CAJA(:actorId, :cajaId, :efectivoInicial, :resultado); END;", binds: { actorId: 7, cajaId: 2, efectivoInicial: 10.5, resultado: bindsSalida } },
    { sql: "BEGIN SAB_VENTA_CANCELAR(:actorId, :ventaId); END;", binds: { actorId: 7, ventaId: 91 } }
  ]);
});
