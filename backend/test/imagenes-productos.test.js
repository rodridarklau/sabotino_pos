const assert = require("node:assert/strict");
const { cursor, nombreProcedimiento } = require("./oracle-mock");
const { before, after, test } = require("node:test");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const express = require("express");
const sharp = require("sharp");
const db = require("../src/config/database");

let servidor, url, carpeta, crearAlmacen, optimizarFoto;

before(async () => {
  carpeta = await mkdtemp(join(tmpdir(), "sabotino-imagenes-test-"));
  const original = db.obtenerConexion;
  db.obtenerConexion = async () => ({
    async execute(sql, binds) {
      const nombre = nombreProcedimiento(sql);
      if (nombre === "SAB_API_ROL_ACTIVO") return cursor([{ NOMBRE_ROL: binds.actorId === 1 ? "DUENO" : "VENDEDOR" }]);
      assert.equal(nombre, "SAB_API_IMAGEN_PRODUCTO");
      return cursor(binds.id === 17 ? [{ ID_PRODUCTO: 17 }] : []);
    },
    async close() {}
  });
  const { crearRouter } = require("../src/routes/imagenes-productos.routes");
  ({ crearAlmacen, optimizarFoto } = require("../src/services/imagenes-productos"));
  db.obtenerConexion = original;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers["x-rol"]) req.session = { usuario: {
      rol: req.headers["x-rol"], id: req.headers["x-rol"] === "DUENO" ? 1 : 2
    } };
    next();
  });
  app.use("/api/productos-imagenes", crearRouter(crearAlmacen(carpeta)));
  await new Promise((resolver) => { servidor = app.listen(0, "127.0.0.1", resolver); });
  url = `http://127.0.0.1:${servidor.address().port}/api/productos-imagenes`;
});

after(async () => {
  if (servidor) await new Promise((resolver) => servidor.close(resolver));
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

const poner = (id, dato, rol = "DUENO") => fetch(`${url}/${id}`, {
  method: "PUT", headers: { "Content-Type": "application/json", "x-rol": rol }, body: JSON.stringify(dato)
});
const crearFoto = (formato) => sharp({ create: { width: 900, height: 400, channels: 3, background: "#f0d1ad" } })
  .toFormat(formato).toBuffer();

test("restringe la administración y guarda una asociación por ID con control de revisión", async () => {
  const datos = { imagen: "pan-amasado", favorito: true, revision: 0 };
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await poner(17, datos, "VENDEDOR")).status, 403);
  assert.equal((await poner(18, datos)).status, 404);
  assert.equal((await poner(17, { ...datos, imagen: "../sin-permiso" })).status, 400);
  const creada = await poner(17, datos);
  assert.equal(creada.status, 200);
  assert.equal((await creada.json()).ruta, "/productos-base/pan-amasado.svg");
  assert.equal((await poner(17, datos)).status, 409);
  assert.equal((await crearAlmacen(carpeta).leer())[17].favorito, true);
});

test("decodifica las tres clases de foto, rechaza formatos falsos y sirve la foto válida", async () => {
  for (const [tipo, mime] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const imagen = await optimizarFoto(await crearFoto(tipo), mime);
    const metadatos = await sharp(imagen).metadata();
    assert.equal(metadatos.format, "webp");
    assert.equal(metadatos.width, 512);
    assert.ok(metadatos.height < 512);
  }
  async function subir(bytes, tipo = "image/png", rol = "DUENO") {
    return fetch(`${url}/17/foto?revision=1&favorito=false`, { method: "POST",
      headers: { "Content-Type": tipo, "x-rol": rol }, body: bytes });
  }
  assert.equal((await subir(Buffer.from("<svg/>"), "image/svg+xml")).status, 400);
  assert.equal((await subir(Buffer.from("no es una imagen"))).status, 400);
  assert.equal((await subir(await crearFoto("jpeg"))).status, 400);
  assert.equal((await subir(await crearFoto("png"), "image/png", "VENDEDOR")).status, 403);
  assert.equal((await subir(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  const respuesta = await subir(await crearFoto("png"));
  assert.equal(respuesta.status, 200);
  const datos = await respuesta.json();
  assert.match(datos.ruta, /\/[a-f0-9]{64}\.webp$/);
  assert.equal(datos.favorito, false);
  const fotoUrl = new URL(datos.ruta, url);
  assert.equal((await fetch(fotoUrl)).status, 401);
  const vista = await fetch(fotoUrl, { headers: { "x-rol": "VENDEDOR" } });
  assert.equal(vista.status, 200);
  assert.equal(vista.headers.get("content-type"), "image/webp");
  assert.match(vista.headers.get("cache-control"), /private.*immutable/);
  assert.equal((await poner(17, { favorito: true, revision: 2 })).status, 200);
  assert.equal((await crearAlmacen(carpeta).leer())[17].foto, datos.ruta.split("/").at(-1));
});

test("serializa escrituras y rechaza cambios hechos sobre una revisión anterior", async () => {
  const nuevo = crearAlmacen(carpeta);
  const [a, b, c] = await Promise.all([
    nuevo.guardar(21, { imagen: "hallulla" }, 0),
    nuevo.guardar(22, { imagen: "croissant", favorito: true }, 0),
    nuevo.guardar(21, { imagen: "marraqueta" }, 0)
  ]);
  assert.equal(a.imagen, "hallulla");
  assert.equal(b.imagen, "croissant");
  assert.equal(c, null);
  const recargado = await crearAlmacen(carpeta).leer();
  assert.equal(recargado[21].imagen, "hallulla");
  assert.equal(recargado[22].favorito, true);
});
