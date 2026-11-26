const assert = require("node:assert/strict");
const { cursor, nombreProcedimiento, sinCursor } = require("./oracle-mock");
const { after, before, test } = require("node:test");
const express = require("express");
const db = require("../src/config/database");
const correo = require("../src/services/correo");
const { generarPdf, correoComprobante } = require("../src/services/comprobante");

const venta = {
  ID_VENTA: 123, ID_USUARIO: 7, ESTADO_VENTA: "CONFIRMADA", TOTAL_VENTA: 16880,
  RESPONSABLE: "María José Pérez", FECHA: "23/11/2026 15:20:00", NOMBRE_CAJA: "Mostrador", ID_TURNO_CAJA: 6
};
const detalles = [
  { ID_DETALLE_VENTA: 1, NOMBRE_PRODUCTO: "Tarta de frambuesa y almendras con crema de vainilla", CANTIDAD: 1, CODIGO_UNIDAD: "UN", PRECIO_UNITARIO_HISTORICO: 12500, SUBTOTAL_LINEA: 12500 },
  { ID_DETALLE_VENTA: 2, NOMBRE_PRODUCTO: "Bizcochos de mantequilla", CANTIDAD: 0.365, CODIGO_UNIDAD: "KG", PRECIO_UNITARIO_HISTORICO: 12000, SUBTOTAL_LINEA: 4380 }
];
const pagos = [
  { ID_PAGO_VENTA: 1, NOMBRE_METODO: "EFECTIVO", MONTO_PAGADO: 6880 },
  { ID_PAGO_VENTA: 2, NOMBRE_METODO: "TARJETA", MONTO_PAGADO: 10000, CODIGO_COMPROBANTE: "REF-28473" }
];
const modelo = { venta, detalles, pagos };
let servidor;
let url;
let enviado;
let errorProveedor = false;
let alEnviar;
const originalesCorreo = { configurado: correo.configurado, enviar: correo.enviar };

before(async () => {
  const conectar = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      const nombre = nombreProcedimiento(sql);
      if (nombre === "SAB_API_ROL_ACTIVO") return cursor([{ NOMBRE_ROL: "VENDEDOR" }]);
      if (nombre === "SAB_API_VENTA_CABECERA") {
        assert.equal(binds.comprobante, 1);
        assert.equal(binds.dueno, 0);
        return cursor(binds.ventaId === 123 && binds.actorId === 7 ? [venta] : []);
      }
      if (["SAB_API_VENTA_DETALLE", "SAB_API_VENTA_PAGOS"].includes(nombre)) {
        assert.deepEqual(sinCursor(binds), { actorId: 7, ventaId: 123, comprobante: 1 });
        return cursor(nombre === "SAB_API_VENTA_DETALLE" ? detalles : pagos);
      }
      assert.fail("Consulta inesperada");
    },
    async close() {}
  });
  const router = require("../src/routes/ventas.routes");
  db.obtenerConexion = conectar;
  correo.configurado = () => true;
  correo.enviar = async (...args) => {
    enviado = args;
    if (alEnviar) await alEnviar();
    if (errorProveedor) throw new Error("Fallo simulado");
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { usuario: { id: Number(req.headers["x-actor"]) || 7, rol: "VENDEDOR" } };
    next();
  });
  app.use(router);
  await new Promise((resolve) => { servidor = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  Object.assign(correo, originalesCorreo);
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
});

function revisarPdf(pdf) {
  const texto = pdf.toString("latin1");
  assert.match(texto, /^%PDF-/);
  assert.match(texto, /\/Subtype \/Image/);
  assert.match(texto, /\/SMask \d+ 0 R/);
  assert.match(texto, /\/MediaBox \[0 0 226\.771[\d]+ (\d+)\]/);
  assert.match(texto, /\/Count 1\b/);
  return Number(/\/MediaBox \[0 0 226\.771[\d]+ (\d+)\]/.exec(texto)[1]);
}

test("genera un ticket térmico con logo y altura adaptable a líneas largas y decimales", async () => {
  const simple = await generarPdf({ ...modelo, detalles: detalles.slice(0, 1) });
  const largo = await generarPdf({
    ...modelo,
    detalles: Array.from({ length: 100 }, (_, i) => ({
      ...detalles[1], ID_DETALLE_VENTA: i, NOMBRE_PRODUCTO: "Pastelería artesanal, crema de lúcuma y frambuesas de estación — edición especial",
      PRECIO_UNITARIO_HISTORICO: 999999999999.99, SUBTOTAL_LINEA: 364999999999.99
    }))
  });
  assert.ok(revisarPdf(largo) > revisarPdf(simple));
  assert.deepEqual(await generarPdf(modelo), await generarPdf(modelo));
});

test("incluye logo CID y PDF válido en el correo HTML", async () => {
  const pdf = await generarPdf(modelo);
  const mensaje = correoComprobante({ ...venta, FECHA: "<script>" }, pdf);
  assert.match(mensaje.html, /cid:logo-sabotino/);
  assert.match(mensaje.html, /&lt;script&gt;/);
  assert.equal(mensaje.attachments[1].content_id, "logo-sabotino");
  assert.deepEqual(Buffer.from(mensaje.attachments[0].content, "base64"), pdf);
});

test("autoriza vista previa y descarga solo para venta confirmada accesible", async () => {
  const r = await fetch(`${url}/123/comprobante/pdf`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition"), /SABOTINO_Comprobante_Venta_000123.pdf/);
  revisarPdf(Buffer.from(await r.arrayBuffer()));
  const vista = await (await fetch(`${url}/123/comprobante`)).json();
  assert.equal(vista.detalles[1].CODIGO_UNIDAD, "KG");
  assert.equal((await fetch(`${url}/123/comprobante`, { headers: { "x-actor": "8" } })).status, 404);
  assert.equal((await fetch(`${url}/124/comprobante/pdf`)).status, 404);
});

test("envía solo con mocks y un rechazo deja disponible el comprobante", async () => {
  const enviar = (destinatario) => fetch(`${url}/123/comprobante/correo`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinatario })
  });
  assert.equal((await enviar("inválido")).status, 400);
  assert.equal((await enviar("cliente@ejemplo.test")).status, 200);
  assert.equal(enviado[0], "cliente@ejemplo.test");
  revisarPdf(Buffer.from(enviado[1].attachments[0].content, "base64"));
  assert.equal(enviado[2], correo.claveEnvio(123, "cliente@ejemplo.test"));
  errorProveedor = true;
  assert.equal((await enviar("otro@ejemplo.test")).status, 502);
  assert.equal((await fetch(`${url}/123/comprobante`)).status, 200);
});

test("reintenta con la misma clave y permite un reenvío explícito de la venta existente", async () => {
  const primero = "00000000-0000-4000-8000-000000000001";
  const segundo = "00000000-0000-4000-8000-000000000002";
  const enviar = (intento, actor = "7") => fetch(`${url}/123/comprobante/correo`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-actor": actor },
    body: JSON.stringify({ destinatario: "cliente@ejemplo.test", intento })
  });
  assert.equal((await enviar(primero, "8")).status, 404);
  assert.equal((await enviar("incorrecto")).status, 400);
  errorProveedor = true;
  assert.equal((await enviar(primero)).status, 502);
  const clave = enviado[2];
  errorProveedor = false;
  assert.equal((await enviar(primero)).status, 200);
  assert.equal(enviado[2], clave);
  assert.equal((await enviar(segundo)).status, 200);
  assert.notEqual(enviado[2], clave);
});

test("el cliente de Resend transmite el adjunto inline y valida la confirmación del proveedor", async (t) => {
  const nombres = ["SABOTINO_RESEND_API_KEY", "SABOTINO_CORREO_REMITENTE"];
  const previos = nombres.map((nombre) => process.env[nombre]);
  t.after(() => nombres.forEach((nombre, i) => {
    if (previos[i] === undefined) delete process.env[nombre];
    else process.env[nombre] = previos[i];
  }));
  process.env[nombres[0]] = "re_simulada";
  process.env[nombres[1]] = "SABOTINO <comprobantes@ejemplo.test>";
  let respuesta = Response.json({ id: "mock-id" });
  t.mock.method(globalThis, "fetch", async (ruta, opciones) => {
    assert.equal(ruta, "https://api.resend.com/emails");
    assert.equal(opciones.headers["Idempotency-Key"], "mock-clave");
    const cuerpo = JSON.parse(opciones.body);
    assert.match(cuerpo.html, /cid:logo-sabotino/);
    assert.equal(cuerpo.attachments[1].content_id, "logo-sabotino");
    revisarPdf(Buffer.from(cuerpo.attachments[0].content, "base64"));
    return respuesta;
  });
  const contenido = correoComprobante(venta, await generarPdf(modelo));
  assert.deepEqual(await originalesCorreo.enviar("cliente@ejemplo.test", contenido, "mock-clave"), { id: "mock-id" });
  respuesta = Response.json({ name: "validation_error" }, { status: 403 });
  await assert.rejects(originalesCorreo.enviar("cliente@ejemplo.test", contenido, "mock-clave"), { estadoProveedor: 403 });
  respuesta = Response.json({});
  await assert.rejects(originalesCorreo.enviar("cliente@ejemplo.test", contenido, "mock-clave"), /no confirmó/);
});

test("bloquea dos envíos simultáneos para la misma venta y destinatario", async () => {
  let listo, liberar;
  const entro = new Promise((resolve) => { listo = resolve; });
  const pausa = new Promise((resolve) => { liberar = resolve; });
  alEnviar = () => { listo(); return pausa; };
  const enviar = (intento) => fetch(`${url}/123/comprobante/correo`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinatario: "concurrente@ejemplo.test", intento })
  });
  const primero = enviar("00000000-0000-4000-8000-000000000001");
  try {
    await entro;
    assert.equal((await enviar("00000000-0000-4000-8000-000000000002")).status, 409);
  } finally {
    alEnviar = null;
    liberar();
    assert.equal((await primero).status, 200);
  }
});
