import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as esperar } from "node:timers/promises";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const navegador = process.env.SABOTINO_NAVEGADOR;
assert(navegador, "Indica la ruta de Chromium, Chrome o Brave en SABOTINO_NAVEGADOR");
const capturas = process.env.SABOTINO_CAPTURAS;
const solicitudes = [];
let rol = "DUENO";
const producto = { ID_PRODUCTO: 1, NOMBRE_PRODUCTO: "Pan amasado", CODIGO_BARRA: "12345",
  ESTADO_PRODUCTO: "S", PRECIO_VENTA_ACTUAL: 650, STOCK_ACTUAL: 4, STOCK_CRITICO: 5,
  CODIGO_UNIDAD: "UN", PERMITE_DECIMALES: "N", ID_CATEGORIA: 1, ID_MARCA: 1, ID_UNIDAD: 1 };
const proveedor = { ID_PROVEEDOR: 1, RAZON_SOCIAL: "Molino Central", RUT_PROVEEDOR: "12345678-5" };
const terminal = { ID_CAJA: 2, NOMBRE_CAJA: "Principal", ESTADO_OPERATIVO: "S", TOTAL_TURNOS: 2 };
const turno = { ...terminal, ID_TURNO_CAJA: 9, ESTADO_TURNO: "CERRADO",
  APERTURA: "2026-11-24 09:00", CIERRE: "2026-11-24 12:00", RESPONSABLE_APERTURA: "Ana",
  RESPONSABLE_CIERRE: "Ana", INICIAL_EFECTIVO: 5000 };
const turnoActivo = { ...turno, ID_TURNO_CAJA: 10, ID_CAJA: 3, NOMBRE_CAJA: "Mostrador", ESTADO_TURNO: "ABIERTO",
  CIERRE: null, INICIAL_TARJETA: 0, INICIAL_TRANSFERENCIA: 0 };
const reportes = new Set(["resumen", "ventas", "productos", "pagos", "compras", "inventario", "movimientos", "caja", "vendedores"]);
const datosReporte = {
  indicadores: { INGRESOS: 2600, TRANSACCIONES: 2, TICKET: 1300 },
  compras: { GASTOS: 1800, ABASTECIMIENTOS: 1 },
  stock: { PRODUCTOS_CRITICOS: 1, INSUMOS_CRITICOS: 0 },
  caja: { ABIERTOS: 0, CERRADOS: 2, CON_DESCUADRE: 0, DESCUADRE: 0 },
  cantidades: [{ UNIDAD: "UN", CANTIDAD: 4 }],
  serie: [], actividad: [], tabla: [], metodos: [], proveedores: [], productos: [] };

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const ruta = url.pathname;
  const json = (datos, estado = 200) => res.writeHead(estado, { "Content-Type": "application/json" }).end(JSON.stringify(datos));
  if (ruta.startsWith("/api/")) {
    solicitudes.push({ ruta, metodo: req.method, parametros: url.searchParams });
    if (ruta === "/api/compras" && req.method === "POST") return json({ estado: "INCIERTO" }, 503);
    if (req.method !== "GET") return json({ mensaje: "Operación fuera del escenario simulado" }, 405);
    switch (ruta) {
      case "/api/auth/yo": return json({ usuario: { id: 1, nombre: "Ana Pérez", rol } });
      case "/api/inicio": return json({ hoy: "2026-11-24", ventas: { TOTAL: 0 }, turnos: [], alertas: [] });
      case "/api/productos": return json({ productos: [producto] });
      case "/api/productos/alertas-stock": return json({ alertas: [producto] });
      case "/api/productos-imagenes": return json({ 1: { ruta: "/productos-base/pan-amasado.svg" } });
      case "/api/catalogos": return json({ categorias: [{ ID_CATEGORIA: 1, NOMBRE_CATEGORIA: "Panadería" }],
        marcas: [{ ID_MARCA: 1, NOMBRE_MARCA: "Propia" }], unidades: [{ ID_UNIDAD: 1, NOMBRE_UNIDAD: "Unidad" }] });
      case "/api/caja": return json({ cajas: [terminal], activos: rol === "VENDEDOR" ? [turnoActivo] : [] });
      case "/api/caja/turnos": return json({ turnos: [turno] });
      case "/api/caja/turnos/9": return json({ turno, pagos: [], ventas: [], auditoria: [], borradores: 0 });
      case "/api/caja/turnos/10": return json({ turno: turnoActivo, pagos: [], ventas: [], auditoria: [], borradores: 0 });
      case "/api/inventario": return json({ productos: [producto], insumos: [],
        tipos: [{ ID_TIPO_AJUSTE: 1, NOMBRE_TIPO_AJUSTE: "Merma", FACTOR_OPERACION: -1 }] });
      case "/api/inventario/historial": return json({ ajustes: [] });
      case "/api/compras/catalogos": return json({ productos: [producto], insumos: [], proveedores: [proveedor] });
      case "/api/compras/historial": return json({ movimientos: [] });
      case "/api/compras/proveedores": return json({ proveedores: [proveedor] });
      case "/api/vendedores": return json({ cajas: [terminal], horarios: [],
        vendedores: [{ ID_USUARIO: 7, NOMBRE_COMPLETO: "Ana Pérez", ESTADO_USUARIO: "S", USERNAME: "ana" }] });
      case "/api/reportes/catalogos": return json({});
      case "/api/ventas": return json({ ventas: [] });
      case "/api/ventas/catalogos": return json({ productos: [], metodos: [], turnos: [] });
      default: {
        const [, , modulo, seccion, formato] = ruta.split("/");
        if (modulo !== "reportes" || !reportes.has(seccion)) return json({ mensaje: "Consulta simulada desconocida" }, 404);
        if (formato) return res.end("Exportación simulada");
        if (seccion === "movimientos") return json({ mensaje: "Error simulado de movimientos" }, 503);
        if (seccion === "ventas") return json({ ...datosReporte,
          serie: [{ FECHA: url.searchParams.get("desde"), INGRESOS: 2600 }],
          tabla: [{ ID: 12, ESTADO: "CONFIRMADA", INGRESOS: 2600 }] });
        return json(datosReporte);
      }
    }
  }
  try {
    const archivo = resolve(frontend, "dist", ruta === "/" ? "index.html" : "." + ruta);
    const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
      ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".webp": "image/webp" };
    assert(archivo.startsWith(resolve(frontend, "dist") + sep));
    const contenido = await readFile(archivo);
    res.writeHead(200, { "Content-Type": tipos[extname(archivo)] ?? "application/octet-stream" }).end(contenido);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});

async function hasta(accion, objetivo) {
  for (let intento = 0; intento < 100; intento++) {
    const valor = await accion();
    if (valor) return valor;
    await esperar(50);
  }
  assert.fail(objetivo);
}

const carpetaTemporal = resolve(tmpdir());
const perfil = await mkdtemp(join(carpetaTemporal, "sabotino-interfaz-"));
servidor.listen(0, "127.0.0.1");
await once(servidor, "listening");
const origen = "http://127.0.0.1:" + servidor.address().port;
const proceso = spawn(navegador, ["--headless", "--no-first-run", "--disable-extensions", "--disable-gpu",
  "--disable-background-networking",
  ...(process.env.SABOTINO_CHROMIUM_LOCAL_SIN_SANDBOX === "1" ? ["--no-sandbox"] : []),
  "--remote-debugging-port=0", "--user-data-dir=" + perfil, "about:blank"], { stdio: "ignore", windowsHide: true });
let socket;
let falloNavegador;
proceso.on("error", (error) => { falloNavegador = error; });

try {
  const puerto = await hasta(async () => {
    if (falloNavegador) throw falloNavegador;
    return readFile(join(perfil, "DevToolsActivePort"), "utf8").then((s) => s.split("\n")[0].trim(), () => null);
  }, "Chromium no inició DevTools");
  const version = await fetch("http://127.0.0.1:" + puerto + "/json/version").then((r) => r.json());
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await once(socket, "open", { signal: AbortSignal.timeout(5000) });
  let id = 0;
  let sessionId;
  const pendientes = new Map();
  const excepciones = [];
  socket.addEventListener("message", ({ data }) => {
    const mensaje = JSON.parse(data);
    if (mensaje.method === "Runtime.exceptionThrown") excepciones.push(mensaje.params.exceptionDetails);
    const resolver = pendientes.get(mensaje.id);
    if (resolver) { pendientes.delete(mensaje.id); resolver(mensaje); }
  });
  async function cdp(method, params = {}) {
    const actual = ++id;
    const resultado = new Promise((resolver, rechazar) => {
      const limite = setTimeout(() => {
        pendientes.delete(actual);
        rechazar(new Error("DevTools no respondió a " + method));
      }, 5000);
      pendientes.set(actual, (mensaje) => { clearTimeout(limite); resolver(mensaje); });
    });
    socket.send(JSON.stringify({ id: actual, method, params, sessionId }));
    const mensaje = await resultado;
    if (mensaje.error) throw new Error(mensaje.error.message);
    return mensaje.result;
  }
  async function DOM(fn, ...args) {
    const expression = "(" + fn + ")(..." + JSON.stringify(args) + ")";
    const { result, exceptionDetails } = await cdp("Runtime.evaluate", { expression, returnByValue: true });
    assert(!exceptionDetails, result.description);
    return result.value;
  }
  const visible = (selector) => DOM((s) => Boolean(document.querySelector(s)?.getClientRects().length), selector);
  const texto = (contenido) => hasta(() => DOM((t) => document.querySelector("main")?.innerText.includes(t), contenido), contenido);
  async function clic(nombre, selector = "button") {
    await hasta(() => DOM((nombre, selector) => {
      const boton = [...document.querySelectorAll(selector)].find((b) =>
        b.getClientRects().length && !b.disabled && b.textContent.trim() === nombre);
      if (boton) boton.click();
      return Boolean(boton);
    }, nombre, selector), nombre);
  }
  async function modulo(nombre) {
    if (await visible(".menu-control")) await clic("Menú");
    await clic(nombre, ".menu-item");
    await hasta(() => visible("main h1"), nombre);
  }
  async function campo(selector, valor) {
    assert(await DOM((s, v) => {
      const control = document.querySelector(s);
      if (!control) return false;
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value").set.call(control, v);
      control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      return true;
    }, selector, valor), selector);
  }
  async function medir(width, height) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  }
  const { targetInfos } = await cdp("Target.getTargets");
  const { targetId } = targetInfos.find((objetivo) => objetivo.type === "page");
  ({ sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true }));
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await medir(1366, 768);
  await cdp("Page.navigate", { url: origen });
  await texto("Hola, Ana");
  await modulo("Caja");
  await texto("No hay turnos abiertos.");
  await campo("#caja-apertura input", "7500");
  await clic("Terminales");
  await clic("Nueva caja");
  await campo("input[name=nombre]", "Mostrador");
  await clic("Turno actual");
  assert.equal(await DOM(() => document.querySelector("#caja-apertura input").value), "7500");
  await clic("Terminales");
  assert.equal(await DOM(() => document.querySelector("input[name=nombre]").value), "Mostrador");
  await clic("2", "#caja-terminales td button");
  assert.equal(await DOM(() => document.querySelector("#caja-historial select").value), "2");
  await clic("Ver turno");
  await texto("Arqueo por método de pago");

  await modulo("Productos");
  await hasta(() => visible(".producto-identidad img"), "Miniatura asociada");
  await clic("Editar");
  await texto("Información comercial");
  await clic("Generar imagen con IA");
  await texto("La generación con IA está desactivada");
  await clic("Cancelar");
  await clic("Abastecer");
  await texto("Artículos de la compra");
  assert.equal(await DOM(() => document.querySelector(".compras-linea select:nth-of-type(1)").value), "PRODUCTO");
  assert.equal(await DOM(() => document.querySelectorAll(".compras-linea select")[1].value), "1");
  await campo(".compras-linea input[type=number]", "6");
  await clic("Historial de compras");
  await texto("No hay abastecimientos de productos registrados.");
  await clic("Nuevo abastecimiento");
  assert.equal(await DOM(() => document.querySelector(".compras-linea input[type=number]").value), "6");
  await clic("+ Agregar otro artículo");
  assert.equal(await DOM(() => document.querySelectorAll(".compras-linea").length), 2);
  await clic("Quitar artículo");
  assert.equal(await DOM(() => document.querySelectorAll(".compras-linea").length), 1);
  await DOM(() => { window.confirm = () => true; });
  await campo(".compras-linea label:nth-child(2) select", "1");
  await campo(".compras-linea label:nth-child(3) select", "1");
  await campo(".compras-linea label:nth-child(4) input", "6");
  await campo(".compras-linea label:nth-child(5) input", "300");
  await clic("Registrar compra");
  await texto("Revisa el historial y las existencias antes de repetirla.");
  assert.equal(await DOM(() => document.querySelector(".compras-linea input[type=number]").value), "");

  await modulo("Inventario");
  await clic("Ajustar");
  await campo("select[name=tipoAjusteId]", "1");
  await campo("input[name=cantidad]", "20");
  await clic("Revisar ajuste");
  await texto("El ajuste dejaría el stock en negativo.");

  await modulo("Proveedores");
  await texto("Molino Central");
  await clic("Editar");
  assert.equal(await DOM(() => document.querySelector("input[name=razonSocial]").value), "Molino Central");
  await clic("Cancelar");
  await campo(".proveedores input[type=search]", "sin resultados");
  await texto("No hay proveedores para mostrar");

  await modulo("Vendedores");
  await clic("Ver horarios");
  await texto("Horarios de Ana Pérez");
  await clic("Asignar horario");
  assert.equal(await DOM(() => document.querySelectorAll("input[type=time]").length), 2);
  await clic("Cancelar");
  await clic("Nuevo vendedor");
  assert(await DOM(() => document.querySelector("input[type=password]").required));

  await modulo("Reportes");
  await texto("Productos críticos");
  for (const nombre of ["Ventas", "Productos", "Pagos", "Compras", "Inventario", "Caja", "Vendedores", "Movimientos"]) {
    await clic(nombre, ".modulo-pestanas button");
    await hasta(() => DOM((n) => document.querySelector("#reportes-resultados h2").textContent === n, nombre), nombre);
  }
  await texto("Error simulado de movimientos");
  await clic("Ventas", ".modulo-pestanas button");
  await hasta(() => visible(".reportes-grafico canvas"), "Gráfico de ventas");
  await DOM(() => document.querySelector(".reportes-grafico canvas").focus());
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  await texto("· Período actual:");
  for (const tipo of ["CSV", "PDF"]) {
    await clic("Descargar " + tipo);
    const ruta = "/api/reportes/ventas/" + tipo.toLowerCase();
    const req = await hasta(() => solicitudes.find((s) => s.ruta === ruta), ruta);
    assert(req.parametros.get("desde") && req.parametros.get("hasta"));
  }
  await clic("Resumen", ".modulo-pestanas button");

  const modulos = ["Caja", "Productos", "Inventario", "Compras", "Proveedores", "Vendedores", "Reportes", "Ventas"];
  const contenido = ["No hay turnos abiertos.", "Pan amasado", "Pan amasado", "Artículos de la compra",
    "Molino Central", "Ana Pérez", "Productos críticos", "Tu carrito está vacío"];
  if (capturas) await mkdir(capturas, { recursive: true });
  for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [768, 1024], [390, 844]]) {
    await medir(width, height);
    for (const [i, nombre] of modulos.entries()) {
      await modulo(nombre);
      await texto(contenido[i]);
      assert(await DOM(() => document.documentElement.scrollWidth <= window.innerWidth), nombre + " a " + width);
      if (capturas && [1366, 390].includes(width) && nombre !== "Ventas") {
        const { data } = await cdp("Page.captureScreenshot", { format: "png" });
        await writeFile(join(capturas, nombre.toLowerCase() + "-" + width + ".png"), Buffer.from(data, "base64"));
      }
    }
  }
  rol = "VENDEDOR";
  await cdp("Page.reload");
  await texto("Hola, Ana");
  await clic("Menú");
  assert.deepEqual(await DOM(() => [...document.querySelectorAll(".menu-item")].map((b) => b.textContent.trim())),
    ["Inicio", "Ventas", "Caja", "Productos"]);
  await clic("Caja", ".menu-item");
  await clic("Mostrador · #10");
  await texto("Arqueo por método de pago");
  assert(await DOM(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Revisar cierre").disabled));
  await campo('input[aria-label="Importe contado de efectivo"]', "5000");
  await campo('input[aria-label="Importe contado de tarjeta"]', "0");
  await campo('input[aria-label="Importe contado de transferencia"]', "0");
  await clic("Revisar cierre");
  await texto("Confirmar cierre del turno #10");
  await clic("Terminales");
  assert.equal(await DOM(() => [...document.querySelectorAll("#caja-terminales button")].some((b) =>
    ["Nueva caja", "Editar", "Eliminar"].includes(b.textContent.trim()))), false);
  await clic("Turno actual");
  await texto("Confirmar cierre del turno #10");
  await clic("Cancelar");
  assert.deepEqual(excepciones, []);
  assert.deepEqual(solicitudes.filter((s) => s.metodo !== "GET").map((s) => [s.metodo, s.ruta]), [["POST", "/api/compras"]]);
  console.log("Interfaz verificada con Chromium y respuestas simuladas en cinco resoluciones.");
} finally {
  socket?.close();
  if (proceso.pid && proceso.exitCode === null) {
    const salida = once(proceso, "exit");
    proceso.kill();
    await Promise.race([salida, esperar(2000)]);
  }
  servidor.closeAllConnections();
  servidor.close();
  if (dirname(perfil) === carpetaTemporal && basename(perfil).startsWith("sabotino-interfaz-")) {
    await rm(perfil, { recursive: true, force: true, maxRetries: 7, retryDelay: 200 }).catch(() => {});
  }
}
