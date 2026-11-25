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
let cajaAbierta = false;
let catalogoLargo = false;
let nuevoInsumo = null;
let probarProveedorNuevo = false;
let proveedorNuevo = null;
let mostrarMovimientos = false;
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
    const solicitud = { ruta, metodo: req.method, parametros: url.searchParams };
    solicitudes.push(solicitud);
    if (ruta === "/api/compras" && req.method === "POST") return json({ estado: "INCIERTO" }, 503);
    if (ruta === "/api/compras/proveedores" && req.method === "POST" && probarProveedorNuevo) {
      for await (const parte of req) void parte;
      proveedorNuevo = { ID_PROVEEDOR: 45, RAZON_SOCIAL: "Proveedor de prueba", RUT_PROVEEDOR: "111-1" };
      return json({ estado: "OK", idProveedor: 45 }, 201);
    }
    if (ruta === "/api/inventario/insumos" && req.method === "POST") {
      const partes = [];
      for await (const parte of req) partes.push(parte);
      solicitud.datos = JSON.parse(Buffer.concat(partes));
      nuevoInsumo = { ID_INSUMO: 12, NOMBRE_INSUMO: solicitud.datos.nombre, ESTADO_ACTIVO: solicitud.datos.estado,
        STOCK_ACTUAL: solicitud.datos.stockInicial, STOCK_CRITICO: solicitud.datos.stockCritico, CODIGO_UNIDAD: "UN" };
      return json({ estado: "OK", idInsumo: 12 }, 201);
    }
    if (ruta === "/api/caja/turnos" && req.method === "POST") {
      cajaAbierta = true;
      return json({ turnoId: 10 }, 201);
    }
    if (ruta === "/api/caja/turnos/10/cierre" && req.method === "POST") {
      cajaAbierta = false;
      return json({ turnoId: 10, descuadre: 0 });
    }
    if (ruta === "/api/ventas" && req.method === "POST") {
      const partes = [];
      for await (const parte of req) partes.push(parte);
      solicitud.datos = JSON.parse(Buffer.concat(partes));
      return json({ estado: "OK", ventaId: 15, total: 650 }, 201);
    }
    if (req.method !== "GET") return json({ mensaje: "Operación fuera del escenario simulado" }, 405);
    switch (ruta) {
      case "/api/auth/yo": return json({ usuario: { id: 1, nombre: "Ana Pérez", rol } });
      case "/api/inicio": return json({ hoy: "2026-11-24", ventas: { TOTAL: 0, CANTIDAD: 0 }, turnos: [], alertas: [],
        alertasInsumos: [{ ID_INSUMO: 1, NOMBRE_INSUMO: "Harina", STOCK_ACTUAL: 2, STOCK_CRITICO: 2, CODIGO_UNIDAD: "KG" }] });
      case "/api/productos": return json({ productos: catalogoLargo ? Array.from({ length: 20 }, (_, i) => ({
        ...producto, ID_PRODUCTO: i + 1, NOMBRE_PRODUCTO: `Pan amasado ${i + 1}`
      })) : [producto] });
      case "/api/productos/alertas-stock": return json({ alertas: [producto] });
      case "/api/productos-imagenes": return json({ 1: { ruta: "/productos-base/pan-amasado.svg" } });
      case "/api/catalogos": return json({ categorias: [{ ID_CATEGORIA: 1, NOMBRE_CATEGORIA: "Panadería" }],
        marcas: [{ ID_MARCA: 1, NOMBRE_MARCA: "Propia" }], unidades: [{ ID_UNIDAD: 1, NOMBRE_UNIDAD: "Unidad", CODIGO_UNIDAD: "UN", PERMITE_DECIMALES: "N" }] });
      case "/api/caja": return json({ caja: null, activos: cajaAbierta ? [turnoActivo] : [], resumenDia: { CANTIDAD: 0, TOTAL: 0 } });
      case "/api/caja/turnos": return json({ turnos: [turno] });
      case "/api/caja/turnos/9": return json({ turno, pagos: [], ventas: [], auditoria: [], borradores: 0 });
      case "/api/caja/turnos/10": return json({ turno: cajaAbierta ? turnoActivo : { ...turno, ID_TURNO_CAJA: 10 },
        pagos: [], resumen: { CANTIDAD: 0, TOTAL: 0 }, ventas: [], auditoria: [], borradores: 0 });
      case "/api/inventario": return json({ productos: [producto],
        insumos: [{ ID_INSUMO: 1, NOMBRE_INSUMO: "Harina", STOCK_ACTUAL: 8, STOCK_CRITICO: 2, CODIGO_UNIDAD: "KG" },
          ...(nuevoInsumo && url.searchParams.get("incluirInactivos") === "1" ? [nuevoInsumo] : [])],
        tipos: [{ ID_TIPO_AJUSTE: 1, NOMBRE_TIPO_AJUSTE: "Merma", FACTOR_OPERACION: -1 }] });
      case "/api/inventario/historial": return json({ ajustes: [] });
      case "/api/compras/catalogos": return json({ productos: [producto], insumos: [], proveedores: [
        proveedor, { ID_PROVEEDOR: 57, RAZON_SOCIAL: "SABOTINO — Producción propia" }
      ] });
      case "/api/compras/historial": {
        const pagina = Number(url.searchParams.get("pagina") || 1);
        return json({ movimientos: mostrarMovimientos ? [{ ID_ABASTECIMIENTO: pagina, NOMBRE_PRODUCTO: `Movimiento ${pagina}`,
          CANTIDAD_COMPRADA: 2, COSTO_UNITARIO_COMPRA: 100, TOTAL: 200, CODIGO_UNIDAD: "UN", PROVEEDOR: "Molino Central" }] : [],
          hayMas: mostrarMovimientos && pagina === 1 });
      }
      case "/api/compras/proveedores": return json({ proveedores: probarProveedorNuevo ? (proveedorNuevo ? [proveedorNuevo] : [])
        : catalogoLargo ? Array.from({ length: 25 }, (_, i) => ({
        ...proveedor, ID_PROVEEDOR: i + 1, RAZON_SOCIAL: `Molino Central ${i + 1}`
      })) : [proveedor] });
      case "/api/vendedores": return json({ cajas: [terminal], horarios: [],
        vendedores: [{ ID_USUARIO: 7, NOMBRE_COMPLETO: "Ana Pérez", ESTADO_USUARIO: "S", USERNAME: "ana" }] });
      case "/api/reportes/catalogos": return json({});
      case "/api/ventas": return json({ ventas: [] });
      case "/api/ventas/catalogos": return json({ productos: [producto],
        metodos: [{ ID_METODO_PAGO: 1, NOMBRE_METODO: "EFECTIVO", REQUIERE_COMPROBANTE: "N" }],
        turnos: cajaAbierta ? [turnoActivo] : [] });
      case "/api/ventas/15/comprobante": return json({ venta: { ID_VENTA: 15, TOTAL_VENTA: 650 }, detalles: [], pagos: [] });
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
    await hasta(() => DOM((nombre) => {
      const destino = [...document.querySelectorAll(".menu-item")].find((boton) => boton.textContent.trim() === nombre);
      if (destino?.getClientRects().length) {
        destino.click();
        return true;
      }
      document.querySelector('.menu-control[aria-expanded="false"]')?.click();
      return false;
    }, nombre), nombre);
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
  await DOM(() => { window.confirm = () => true; });
  await modulo("Caja");
  await texto("Turno cerrado");
  await campo("#caja-apertura input", "7500");
  assert.equal(await DOM(() => document.querySelector(".caja select")), null);
  await clic("Historial de turnos");
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
  await modulo("Inicio");
  await clic("Ver Insumos");
  await texto("Harina");
  await modulo("Compras");
  await texto("Artículos de la compra");
  assert.equal(await DOM(() => document.querySelector(".compras-linea input[type=number]").value), "6");
  await clic("Historial de compras");
  await texto("No hay abastecimientos de productos registrados.");
  mostrarMovimientos = true;
  await clic("Actualizar historial");
  await texto("Movimiento 1");
  await clic("Siguiente", "#compras-historial button");
  await texto("Movimiento 2");
  mostrarMovimientos = false;
  await clic("Nuevo abastecimiento");
  assert.equal(await DOM(() => document.querySelector(".compras-linea input[type=number]").value), "6");
  await clic("+ Agregar otro artículo");
  assert.equal(await DOM(() => document.querySelectorAll(".compras-linea").length), 2);
  await clic("Quitar artículo");
  assert.equal(await DOM(() => document.querySelectorAll(".compras-linea").length), 1);
  await clic("Usar producción propia");
  assert.equal(await DOM(() => document.querySelector('.compras-linea label:nth-child(3) select').value), "57");
  await DOM(() => { window.confirm = () => true; });
  await campo(".compras-linea label:nth-child(2) select", "1");
  await campo(".compras-linea label:nth-child(3) select", "1");
  await campo(".compras-linea label:nth-child(4) input", "6");
  await campo(".compras-linea label:nth-child(5) input", "300");
  await clic("Registrar compra");
  await texto("Revisa el historial y las existencias antes de repetirla.");
  assert.equal(await DOM(() => document.querySelector(".compras-linea input[type=number]").value), "");

  await modulo("Inventario");
  await clic("Quitar stock");
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
  await texto("No encontramos proveedores con esa búsqueda");

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

  const modulos = ["Inicio", "Caja", "Productos", "Insumos", "Inventario", "Compras", "Proveedores", "Vendedores", "Reportes", "Ventas"];
  const contenido = ["Ventas registradas", "Turno cerrado", "Pan amasado", "Harina", "Pan amasado", "Artículos de la compra",
    "Molino Central", "Ana Pérez", "Productos críticos", "Sin turno abierto"];
  if (capturas) await mkdir(capturas, { recursive: true });
  for (const [width, height] of [[2560, 1440], [1920, 1080], [1672, 941], [1600, 900], [1366, 768], [1280, 720], [1024, 768], [768, 1024], [390, 844]]) {
    await medir(width, height);
    for (const [i, nombre] of modulos.entries()) {
      await modulo(nombre);
      await texto(contenido[i]);
      assert(await DOM(() => document.documentElement.scrollWidth <= window.innerWidth), nombre + " a " + width);
      assert(await DOM(() => {
        const area = document.querySelector("main").getBoundingClientRect();
        return Math.abs(area.right - document.documentElement.clientWidth) < 2;
      }), "Ancho del área principal de " + nombre + " a " + width);
      if (nombre === "Inicio") {
        assert(await DOM(() => Boolean(document.querySelector("#resumen-dia")) &&
          document.querySelectorAll(".inicio-indicadores .tarjeta-dato").length === 4 &&
          !document.querySelector(".inicio-acciones")));
      }
      if (nombre === "Caja") {
        assert(await hasta(() => DOM(() => {
          const barra = document.querySelector(".barra-principal");
          const vitrina = document.querySelector(".caja-vitrina");
          const escritorio = window.innerWidth > 900;
          return (!escritorio || barra.offsetWidth === 228) && vitrina?.complete && vitrina.naturalWidth > 0 &&
            !document.querySelector("main").textContent.includes("Resumen del día") && Boolean(document.querySelector("#caja-apertura"));
        }), "Composición de Caja a " + width));
      }
      if (capturas && [1672, 1366, 390].includes(width)) {
        const { data } = await cdp("Page.captureScreenshot", { format: "png" });
        await writeFile(join(capturas, nombre.toLowerCase() + "-" + width + ".png"), Buffer.from(data, "base64"));
      }
    }
  }
  async function alcanzarFinal(selector, etiqueta) {
    await hasta(() => DOM((selector) => {
      const destino = document.querySelector(selector);
      if (!destino) return false;
      destino.scrollIntoView({ block: "end", inline: "nearest" });
      const rect = destino.getBoundingClientRect();
      return scrollY > 0 && rect.bottom <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth;
    }, selector), etiqueta);
  }
  catalogoLargo = true;
  for (const [width, height] of [[1280, 720], [390, 844]]) {
    await medir(width, height);
    await modulo("Productos");
    await texto("Pan amasado 20");
    await alcanzarFinal(".productos-catalogo tbody tr:last-child", "Último producto");
    await modulo("Proveedores");
    await texto("Molino Central 25");
    await alcanzarFinal(".proveedores tbody tr:last-child", "Último proveedor");
    await modulo("Compras");
    for (let i = 0; i < 11; i++) await clic("+ Agregar otro artículo");
    assert.equal(await DOM(() => document.querySelectorAll(".compras-linea").length), 12);
    await alcanzarFinal(".compras-pie-visual button[type=submit]", "Registrar compra tras doce líneas");
    await alcanzarFinal(".compras-pie-visual .compras-secundario", "Cancelar compra tras doce líneas");
    await clic("Cancelar", ".compras-pie-visual button");
  }
  catalogoLargo = false;
  probarProveedorNuevo = true;
  await modulo("Insumos");
  await clic("+ Nuevo insumo");
  await hasta(() => DOM(() => document.querySelector('.nuevo-insumo select[name="unidadId"]')?.options.length > 1), "Unidades del alta");
  await campo('.nuevo-insumo input[name="nombre"]', "Insumo de prueba");
  await campo('.nuevo-insumo select[name="unidadId"]', "1");
  await texto("Todavía no hay proveedores");
  await clic("Registrar proveedor", ".nuevo-insumo button");
  await texto("Registrar proveedor");
  await campo('.proveedores input[name="rut"]', "111-1");
  await campo('.proveedores input[name="razonSocial"]', "Proveedor de prueba");
  await clic("Guardar proveedor");
  await texto("Proveedor registrado correctamente");
  await clic("← Volver al nuevo insumo");
  await hasta(() => DOM(() => document.querySelector('.nuevo-insumo select[name="proveedorId"]')?.options.length > 1), "Proveedores del alta");
  assert.equal(await DOM(() => document.querySelector('.nuevo-insumo input[name="nombre"]').value), "Insumo de prueba");
  assert.equal(await DOM(() => document.querySelector('.nuevo-insumo select[name="proveedorId"]').value), "45");
  await campo('.nuevo-insumo select[name="estado"]', "N");
  await clic("Guardar insumo");
  await texto("Insumo registrado correctamente (ID 12)");
  await hasta(() => DOM(() => document.querySelector(".insumos-existencias tbody")?.textContent.includes("Insumo de prueba Inactivo")),
    "Consulta del insumo inactivo");
  assert.deepEqual(solicitudes.find((s) => s.ruta === "/api/inventario/insumos" && s.metodo === "POST").datos,
    { nombre: "Insumo de prueba", unidadId: 1, proveedorId: 45, costo: 0, stockInicial: 0, stockCritico: 0, estado: "N" });
  rol = "VENDEDOR";
  await cdp("Page.reload");
  await texto("Hola, Ana");
  await DOM(() => { window.confirm = () => true; });
  await clic("Menú");
  assert.deepEqual(await DOM(() => [...document.querySelectorAll(".menu-item")].map((b) => b.textContent.trim())),
    ["Inicio", "Ventas", "Caja", "Productos"]);
  await clic("Ventas", ".menu-item");
  await texto("Sin turno abierto");
  assert.equal(await visible("#ventas-catalogo"), false);
  await clic("Abrir turno y comenzar a vender");
  await texto("Tu carrito está vacío");
  await medir(1600, 900);
  assert(await DOM(() => {
    const catalogo = document.querySelector(".pos-catalogo");
    const pedido = document.querySelector(".pos-venta");
    return catalogo.offsetWidth > pedido.offsetWidth && pedido.offsetHeight === catalogo.offsetHeight &&
      getComputedStyle(pedido).overflowY === "visible";
  }), "Catálogo y pedido a la misma altura, con desplazamiento natural");
  if (capturas) {
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    await writeFile(join(capturas, "ventas-turno-abierto-1600.png"), Buffer.from(data, "base64"));
  }
  await medir(390, 844);
  await clic("+ Agregar", '[aria-label="Agregar Pan amasado"]');
  await modulo("Inicio");
  await modulo("Ventas");
  await texto("Pedido actual");
  await hasta(() => visible(".ventas-linea"), "Pedido recuperado para el mismo turno");
  await clic("Revisar pedido");
  await clic("Continuar al pago");
  await campo(".ventas-cobro input[required][max]", "1000");
  await texto("350,00");
  await clic("Revisar y confirmar");
  await texto("Vuelto $ 350,00");
  await clic("Volver al pago");
  assert.equal(await DOM(() => document.querySelector(".ventas-cobro input[required][max]").value), "1000");
  await clic("Revisar y confirmar");
  await clic("Confirmar venta");
  await texto("¿Desea generar comprobante?");
  await clic("Sí");
  await hasta(() => visible(".comprobante-ticket"), "Comprobante de la venta");
  await clic("Cerrar vista previa");
  await texto("Tu carrito está vacío");
  assert.deepEqual(solicitudes.find((s) => s.ruta === "/api/ventas" && s.metodo === "POST")?.datos, {
    turnoId: 10, totalEsperado: 650, lineas: [{ productoId: 1, cantidad: 1 }],
    pagos: [{ metodoId: 1, monto: 650, comprobante: "" }]
  });
  await clic("+ Agregar", '[aria-label="Agregar Pan amasado"]');
  await clic("Revisar pedido");
  await clic("Continuar al pago");
  await campo(".ventas-cobro input[required][max]", "650");
  await clic("Revisar y confirmar");
  await clic("Confirmar venta");
  await clic("No", ".ventas-recibo button");
  await texto("Tu carrito está vacío");
  await modulo("Caja");
  await texto("Turno abierto");
  await clic("Cerrar turno");
  await texto("Arqueo por método de pago");
  await campo('input[aria-label="Importe contado de efectivo"]', "5000");
  await campo('input[aria-label="Importe contado de tarjeta"]', "0");
  await campo('input[aria-label="Importe contado de transferencia"]', "0");
  await clic("Revisar cierre");
  await clic("Confirmar cierre");
  await texto("Descuadre registrado");
  await modulo("Ventas");
  await texto("Sin turno abierto");
  assert.deepEqual(excepciones, []);
  assert.deepEqual(solicitudes.filter((s) => s.metodo !== "GET").map((s) => [s.metodo, s.ruta]),
    [["POST", "/api/compras"], ["POST", "/api/compras/proveedores"], ["POST", "/api/inventario/insumos"], ["POST", "/api/caja/turnos"], ["POST", "/api/ventas"], ["POST", "/api/ventas"],
      ["POST", "/api/caja/turnos/10/cierre"]]);
  console.log("Interfaz verificada con Chromium y respuestas simuladas en nueve resoluciones, incluidas listas y compras largas.");
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
