const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const express = require("express");
const db = require("../src/config/database");
const { csv, pdf } = require("../src/services/reportes-exportacion");
let filtros;

let servidor;
let url;
const llamadas = [];

before(async () => {
  const original = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      llamadas.push({ sql, binds });
      assert.match(sql, /^(SELECT|WITH)/);
      assert.doesNotMatch(sql, /\b(?:FOR UPDATE|NEXTVAL|INSERT INTO|DELETE FROM)\b/i);
      if (sql.startsWith("SELECT R.NOMBRE_ROL")) return { rows: [{ NOMBRE_ROL: binds.actorId === 1 ? "DUENO" : "VENDEDOR" }] };
      if (sql.includes("OFFSET")) {
        return { rows: Array.from({ length: 26 }, (_, i) => ({ ID: i + 1, FECHA: "2026-11-02", RESPONSABLE: "=1+1", IMPORTE: 42.5 })) };
      }
      return { rows: [] };
    },
    async close() {}
  });
  const router = require("../src/routes/reportes.routes");
  ({ filtros } = require("../src/services/reportes"));
  db.obtenerConexion = original;
  const app = express();
  app.use((req, res, next) => {
    if (req.headers["x-rol"]) req.session = { usuario: {
      id: Number(req.headers["x-actor"] || 1), rol: req.headers["x-rol"]
    } };
    next();
  });
  app.use(router);
  await new Promise((resolve) => { servidor = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
});

const base = { desde: "2026-11-01", hasta: "2026-11-30" };
const pedir = (ruta, params = {}, rol = "DUENO", actor = 1) => fetch(
  `${url}${ruta}?${new URLSearchParams({ ...base, ...params })}`, { headers: { "x-rol": rol, "x-actor": String(actor) } }
);

test("rango civil válido, anterior equivalente y filtros enlazables", () => {
  assert.equal(filtros(base).anterior, "2026-10-02");
  assert.equal(filtros({ ...base, desde: "2026-02-30" }), null);
  assert.equal(filtros({ ...base, hasta: "2028-11-30" }), null);
  assert.equal(filtros({ ...base, estado: "' OR 1=1" }), null);
  assert.equal(filtros({ ...base, caja: "1 OR 1=1" }), null);
  assert.equal(filtros({ ...base, agrupacion: "DD'); DROP" }), null);
  assert.equal(filtros({ ...base, pagina: 0 }), null);
  assert.equal(filtros({ ...base, caja: "2", top: 20 }).caja, 2);
});

test("requiere dueño activo para reportes, catálogos y exportaciones", async () => {
  assert.equal((await fetch(`${url}/catalogos`)).status, 401);
  for (const ruta of ["/catalogos", "/resumen", "/ventas/csv", "/compras/pdf"]) {
    assert.equal((await pedir(ruta, {}, "VENDEDOR", 2)).status, 403);
  }
  assert.equal((await pedir("/resumen", {}, "DUENO", 2)).status, 403);
  assert.equal((await pedir("/productos", { orden: "cantidad" })).status, 400);
  assert.equal((await pedir("/ventas", { desde: "2026-01-45" })).status, 400);
});

test("pagina detalles y exporta con filtros de negocio desde la primera fila", async () => {
  const filtro = { caja: "3", producto: "4", metodo: "2", pagina: "3", estado: "ANULADA", agrupacion: "semana" };
  const r = await pedir("/ventas", filtro);
  assert.equal(r.status, 200);
  const datos = await r.json();
  assert.equal(datos.tabla.length, 25);
  assert.equal(datos.hayMas, true);
  assert.equal(llamadas.at(-1).binds.desplazamiento, 50);
  assert.equal(llamadas.at(-1).binds.limite, 26);
  assert.equal(llamadas.at(-1).binds.metodo, 2);
  assert.equal(llamadas.at(-1).binds.estado, "ANULADA");
  const descarga = await pedir("/ventas/csv", filtro);
  assert.equal(descarga.status, 200);
  assert.match(descarga.headers.get("content-disposition"), /SABOTINO_ventas_.*\.csv/);
  assert.match(await descarga.text(), /"'=1\+1";42,5/);
  assert.equal(llamadas.at(-1).binds.desplazamiento, 0);
  assert.equal(llamadas.at(-1).binds.limite, 1001);
});

test("el CSV incluye BOM, escapa fórmulas y preserva acentos y números negativos", () => {
  const archivo = csv([{ ARTICULO: 'Árbol "dorado"', IMPORTE: -12.25, OTRO: "  @SUM(A1)" }]);
  assert.equal(archivo.codePointAt(0), 0xfeff);
  assert.match(archivo, /"Árbol ""dorado""";-12,25;"'  @SUM\(A1\)"/);
});

test("el PDF administrativo pagina, incorpora logo y utiliza A4 horizontal", async () => {
  const archivo = await pdf("ventas", base, {
    indicadores: { INGRESOS: 125.75 },
    tabla: Array.from({ length: 90 }, (_, ID) => ({ ID, RESPONSABLE: "María Pérez", IMPORTE: 125.75 }))
  });
  const bytes = archivo.toString("latin1");
  assert.match(bytes, /^%PDF/);
  assert.match(bytes, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.match(bytes, /\/Subtype \/Image/);
  const paginas = Number(/\/Count (\d+)/.exec(bytes)?.[1]);
  assert.ok(paginas >= 2 && paginas <= 6, `Páginas de PDF: ${paginas}`);
});

test("mantiene Stock con su primera fila y repite la cabecera en páginas siguientes", async () => {
  const { inflateSync } = require("node:zlib");
  const archivo = await pdf("resumen", base, {
    cantidades: Array.from({ length: 13 }, (_, i) => ({ UNIDAD: `Unidad ${i}`, CANTIDAD: i })),
    stock: Array.from({ length: 52 }, (_, i) => ({ ARTICULO: `Prueba fila ${String(i).padStart(2, "0")}`, STOCK_ACTUAL: i }))
  });
  const paginas = [...archivo.toString("latin1").matchAll(/\bstream\n([\s\S]*?)\nendstream/g)]
    .map(([, stream]) => inflateSync(Buffer.from(stream, "latin1")).toString("latin1"))
    .filter((stream) => stream.includes("BT\n"))
    .map((stream) => [...stream.matchAll(/\[([^\]]+)\]\s*TJ/g)].map(([, fragmentos]) =>
      [...fragmentos.matchAll(/<([a-f0-9]+)>/gi)].map(([, hex]) => Buffer.from(hex, "hex").toString("latin1")).join("")));
  const paginaStock = paginas.findIndex((lineas) => lineas.includes("Stock"));
  assert.ok(paginaStock > 0);
  assert.ok(paginas[paginaStock].includes("Prueba fila 00"));
  assert.ok(paginas.length > paginaStock + 1);
  for (const lineas of paginas.slice(paginaStock)) {
    assert.ok(lineas.includes("Articulo"));
    assert.ok(lineas.includes("Stock actual"));
    assert.ok(lineas.some((linea) => linea.startsWith("Prueba fila")));
  }
});
