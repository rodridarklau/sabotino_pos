const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { createServer } = require("node:net");
const { resolve } = require("node:path");
const { setTimeout: esperar } = require("node:timers/promises");
const oracledb = require("oracledb");
const { consultarProcedimiento, ejecutarProcedimiento, numeroSalida } = require("../src/config/procedimientos");
const { comprobarConcurrencia } = require("./concurrencia-oracle");

const { SABOTINO_QA_USER: user, SABOTINO_QA_PASSWORD: password, SABOTINO_QA_CONNECT: connectString } = process.env;
const credenciales = { user, password, connectString };
const clave = "SABOTINO-prueba-2026";

async function preparar(conexion) {
  const identidad = await conexion.execute("SELECT USER, (SELECT COUNT(*) FROM USUARIO) FROM DUAL");
  assert.deepEqual(identidad.rows[0], [user, 0], "El esquema de prueba debe estar vacío");
  const compilacion = await conexion.execute(
    "SELECT COUNT(*), COUNT(CASE WHEN STATUS = 'VALID' THEN 1 END), " +
    "COUNT(CASE WHEN SUBSTR(OBJECT_NAME, 1, 8) = 'SAB_API_' THEN 1 END) " +
    "FROM USER_OBJECTS WHERE OBJECT_TYPE = 'PROCEDURE'"
  );
  assert.deepEqual(compilacion.rows, [[149, 149, 79]], "Deben estar válidos los 149 procedimientos, incluidos los 79 de la API");
  const roles = await conexion.execute("SELECT NOMBRE_ROL FROM ROL_USUARIO ORDER BY NOMBRE_ROL");
  assert.deepEqual(roles.rows, [["DUENO"], ["VENDEDOR"]], "Instala el catálogo fijo de roles al preparar el esquema de prueba");
  const pagos = await conexion.execute("SELECT ID_METODO_PAGO, NOMBRE_METODO FROM METODO_PAGO ORDER BY ID_METODO_PAGO");
  assert.deepEqual(pagos.rows, [[1, "EFECTIVO"], [2, "TARJETA"], [3, "TRANSFERENCIA"]],
    "Instala el catálogo fijo de pagos al preparar el esquema de prueba");
  const catalogos = [
    ["CATEGORIA_PRODUCTO", "ID_CATEGORIA", "1,'Pasteleria QA',NULL"],
    ["MARCA", "ID_MARCA", "1,'SABOTINO QA','Propia'"],
    ["UNIDAD_MEDIDA", "ID_UNIDAD", "1,'UN','Unidad','N'"],
    ["TIPO_AJUSTE_STOCK", "ID_TIPO_AJUSTE", "1,'INGRESO QA',1"]
  ];
  for (const [tabla, claveId, valores] of catalogos) {
    await conexion.execute("INSERT INTO " + tabla + " SELECT " + valores + " FROM DUAL WHERE NOT EXISTS (" +
      "SELECT 1 FROM " + tabla + " WHERE " + claveId + " = 1)");
  }
  await conexion.commit();
}

async function iniciarServidor() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise((fin) => socket.close(fin));
  const servidor = spawn(process.execPath, ["server.js"], {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, ORACLE_USER: user, ORACLE_PASSWORD: password, ORACLE_CONNECT_STRING: connectString,
      PORT: String(port), SESSION_SECRET: randomBytes(32).toString("hex") },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  const base = "http://127.0.0.1:" + port + "/api";
  let registro = "";
  servidor.stderr.on("data", (datos) => { registro += datos; });
  servidor.stdout.resume();
  for (let i = 0; i < 80 && servidor.exitCode === null; i += 1) {
    try {
      const respuesta = await fetch(base + "/auth/estado-inicial", { signal: AbortSignal.timeout(1000) });
      if (respuesta.ok) return { servidor, base };
    } catch { /* El servidor aún no acepta conexiones. */ }
    await esperar(150);
  }
  servidor.kill();
  throw new Error("El servidor de pruebas no inició. " + registro);
}

function cliente(base) {
  let cookie;
  return async (ruta, codigo, { method = "GET", datos } = {}) => {
    const headers = cookie ? { Cookie: cookie } : {};
    if (datos !== undefined) headers["Content-Type"] = "application/json";
    const respuesta = await fetch(base + ruta, { method, headers, body: JSON.stringify(datos) });
    const nuevaCookie = respuesta.headers.getSetCookie()[0];
    if (nuevaCookie) cookie = nuevaCookie.split(";")[0];
    const tipo = respuesta.headers.get("content-type") || "";
    const cuerpo = tipo.includes("application/json") ? await respuesta.json() : Buffer.from(await respuesta.arrayBuffer());
    assert.equal(respuesta.status, codigo, method + " " + ruta + " " + JSON.stringify(cuerpo));
    return cuerpo;
  };
}

async function comprobar() {
  assert.match(user ?? "", /^SAB_QA_[A-Z0-9]+$/, "Configura un usuario Oracle aislado SAB_QA_*");
  assert.ok(password && connectString, "Faltan SABOTINO_QA_PASSWORD o SABOTINO_QA_CONNECT");
  const conexion = await oracledb.getConnection(credenciales);
  let servidor;
  try {
    await preparar(conexion);
    const iniciado = await iniciarServidor();
    servidor = iniciado.servidor;
    const dueno = cliente(iniciado.base);
    const vendedor = cliente(iniciado.base);
    const post = (datos) => ({ method: "POST", datos });
    const put = (datos) => ({ method: "PUT", datos });

    assert.equal((await dueno("/auth/estado-inicial", 200)).requiereConfiguracion, true);
    const { idUsuario } = await dueno("/auth/configurar-dueno", 201, post({
      rut: "11111111-1", nombreCompleto: "Loza Dueño QA", username: "qaOwner", password: clave
    }));
    await dueno("/auth/login", 200, post({ username: "QAOWNER", password: clave }));
    assert.equal((await dueno("/auth/yo", 200)).usuario.id, idUsuario);
    assert.equal((await dueno("/oracle", 200)).totalTablas, 21);
    assert.equal((await dueno("/tablas", 200)).tablas.length, 21);

    assert.equal((await dueno("/catalogos", 200)).unidades.find((unidad) => unidad.ID_UNIDAD === 1).CODIGO_UNIDAD, "UN");
    const producto = {
      idCategoria: 1, idUnidad: 1, idMarca: 1, codigoBarra: "QA100", nombreProducto: "Tarta QA",
      costoProduccion: 2, precioVenta: 10, stockCritico: 1
    };
    const { idProducto } = await dueno("/productos", 201, post(producto));
    await dueno("/productos/" + idProducto, 200, put(producto));
    await dueno("/productos/alertas-stock", 200);
    const { idProveedor } = await dueno("/compras/proveedores", 201, post({ rut: "22222222-2", razonSocial: "Proveedor QA" }));
    assert.equal((await dueno("/compras/catalogos", 200)).productos[0].ID_PRODUCTO, idProducto);
    const insumo = { unidadId: 1, proveedorId: idProveedor, nombre: "Harina QA", costo: 2, stockInicial: 3, stockCritico: 1 };
    await dueno("/inventario/insumos", 400, post({ ...insumo, stockInicial: 1.5 }));
    const { idInsumo } = await dueno("/inventario/insumos", 201, post(insumo));
    await dueno("/compras", 201, post({ articulos: [
      { tipo: "PRODUCTO", id_articulo: idProducto, id_proveedor: idProveedor, cantidad: 5, costo_unitario: 2 },
      { tipo: "INSUMO", id_articulo: idInsumo, id_proveedor: idProveedor, cantidad: 1, costo_unitario: 2 }
    ] }));
    assert.equal((await dueno("/compras/historial", 200)).movimientos[0].TOTAL, 10);
    assert.equal((await dueno("/compras/proveedores?productos=1", 200)).vinculados[0].ID_PRODUCTO, idProducto);
    assert.equal((await dueno("/productos", 200)).productos[0].PROVEEDOR_ACTUAL, "Proveedor QA");
    await dueno("/inventario/ajustes", 201, post({ tipoArticulo: "PRODUCTO", articuloId: idProducto, tipoAjusteId: 1, cantidad: 1 }));
    await dueno("/inventario/ajustes", 201, post({ tipoArticulo: "INSUMO", articuloId: idInsumo, tipoAjusteId: 1, cantidad: 1 }));
    assert.equal((await dueno("/inventario?incluirInactivos=1", 200)).insumos[0].STOCK_ACTUAL, 5);
    assert.equal((await dueno("/inventario/historial?pagina=1", 200)).ajustes.length, 1);
    const datosInsumo = { ...insumo, nombre: "Harina editada QA", stockInicial: 0, estado: "S" };
    await dueno("/inventario/insumos/" + idInsumo, 409, put({ ...datosInsumo, unidadId: 2 }));
    await dueno("/inventario/insumos/" + idInsumo, 200, put(datosInsumo));
    const ficha = (await dueno("/inventario/insumos/" + idInsumo, 200)).insumo;
    assert.equal(ficha.NOMBRE_INSUMO, "Harina editada QA");
    assert.equal(ficha.STOCK_ACTUAL, 5, "Editar la ficha conserva el stock de Oracle");
    await dueno("/compras/proveedores/" + idProveedor, 409, { method: "DELETE" });
    await dueno("/mantenedores/categorias/1", 409, { method: "DELETE" });
    await dueno("/mantenedores/unidades/1", 409, put({ codigo: "UN", nombre: "UNIDAD", decimales: "S" }));
    await dueno("/mantenedores/tipos-ajuste/1", 409, put({ nombre: "INGRESO_MANUAL", factor: -1 }));
    await dueno("/mantenedores/tipos-ajuste/1", 409, { method: "DELETE" });

    const cuentaVendedor = { rut: "33333333-3", nombre: "Vendedor QA", usuario: "qaSeller", password: clave, estado: "S" };
    const { id: vendedorId } = await dueno("/vendedores", 201, post(cuentaVendedor));
    const { id: otroVendedor } = await dueno("/vendedores", 201, post({
      ...cuentaVendedor, rut: "44444444-4", nombre: "Otro vendedor QA", usuario: "qaOther"
    }));
    const { turnoId } = await dueno("/caja/turnos", 201, post({ efectivoInicial: 0 }));
    const caja = (await dueno("/caja", 200)).caja;
    const terminal = "/mantenedores/terminales/" + caja.ID_CAJA;
    await dueno(terminal, 409, put({ nombre: "OTRA", ubicacion: null, estado: "S" }));
    await dueno(terminal, 409, put({ nombre: "MAIN", ubicacion: null, estado: "N" }));
    await dueno(terminal, 409, { method: "DELETE" });
    await dueno(terminal, 200, put({ nombre: "MAIN", ubicacion: "QA", estado: "S" }));
    assert.equal((await dueno("/caja", 200)).activos[0].ID_TURNO_CAJA, turnoId);
    await dueno("/vendedores/" + idUsuario, 404, { method: "DELETE" });
    await assert.rejects(ejecutarProcedimiento(conexion, "SAB_D_USUARIO", { actorId: idUsuario, id: idUsuario }), { errorNum: 20015 });
    await dueno("/vendedores/horarios", 201, post({ vendedorId, cajaId: caja.ID_CAJA, dia: "LUNES", inicio: "10:00", fin: "11:00", estado: "S" }));
    assert.equal((await dueno("/vendedores", 200)).horarios.length, 1);
    await vendedor("/auth/login", 200, post({ username: cuentaVendedor.usuario, password: clave }));
    await vendedor("/mantenedores/categorias", 403);
    await vendedor("/mantenedores/categorias", 403, post({ nombre: "Sin permiso" }));
    await vendedor("/inventario/insumos/" + idInsumo, 403, put(datosInsumo));
    await vendedor("/compras/proveedores/" + idProveedor, 403, { method: "DELETE" });
    await vendedor("/vendedores/" + otroVendedor, 403, { method: "DELETE" });
    await assert.rejects(consultarProcedimiento(conexion, "SAB_L_CATEGORIA_PRODUCTO", { actorId: vendedorId }), { errorNum: 20003 });
    await assert.rejects(ejecutarProcedimiento(conexion, "SAB_D_USUARIO", { actorId: vendedorId, id: otroVendedor }), { errorNum: 20003 });
    assert.equal(Object.hasOwn((await vendedor("/productos", 200)).productos[0], "PROVEEDOR_ACTUAL"), false);
    const catalogo = await vendedor("/ventas/catalogos", 200);
    assert.equal(catalogo.metodos.length, 3);
    assert.equal(catalogo.productos[0].ID_PRODUCTO, idProducto);
    const { ventaId } = await vendedor("/ventas", 201, post({
      turnoId, totalEsperado: 10, lineas: [{ productoId: idProducto, cantidad: 1 }], pagos: [{ metodoId: 1, monto: 10 }]
    }));
    const lecturasVenta = ["SAB_API_VENTA_DETALLE", "SAB_API_VENTA_PAGOS"];
    for (const nombre of lecturasVenta) {
      const leer = (actorId, id = ventaId, comprobante = 1) =>
        consultarProcedimiento(conexion, nombre, { actorId, ventaId: id, comprobante });
      assert.equal((await leer(idUsuario)).length, 1);
      assert.equal((await leer(vendedorId)).length, 1);
      assert.deepEqual(await leer(otroVendedor), []);
      await assert.rejects(leer(null), (error) => error.errorNum === 20002);
    }
    const { resultado: borrador } = await ejecutarProcedimiento(conexion, "SAB_VENTA_INICIAR", { actorId: vendedorId, turnoId, resultado: numeroSalida });
    await ejecutarProcedimiento(conexion, "SAB_VENTA_AGREGAR_PRODUCTO", {
      actorId: vendedorId, ventaId: borrador, productoId: idProducto, cantidad: 1, resultado: numeroSalida
    });
    await ejecutarProcedimiento(conexion, "SAB_VENTA_AGREGAR_PAGO", {
      actorId: vendedorId, ventaId: borrador, metodoId: 1, monto: 10, comprobante: null, resultado: numeroSalida
    });
    for (const nombre of lecturasVenta) {
      const alcance = { actorId: vendedorId, ventaId: borrador };
      assert.equal((await consultarProcedimiento(conexion, nombre, { ...alcance, comprobante: 0 })).length, 1);
      assert.deepEqual(await consultarProcedimiento(conexion, nombre, { ...alcance, comprobante: 1 }), []);
    }
    await vendedor("/ventas/" + borrador + "/comprobante", 404);
    await dueno("/ventas/" + borrador + "/anulacion", 404, post({}));
    await vendedor("/ventas/" + borrador + "/anulacion", 200, post({}));
    assert.equal((await vendedor("/ventas?estado=CONFIRMADA", 200)).ventas[0].ID_VENTA, ventaId);
    assert.equal((await dueno("/ventas/" + ventaId + "/comprobante", 200)).pagos[0].MONTO_PAGADO, 10);
    assert.equal((await dueno("/ventas/" + ventaId + "/comprobante/pdf", 200)).subarray(0, 4).toString(), "%PDF");
    assert.ok((await dueno("/inicio", 200)).alertas);
    assert.equal(Object.hasOwn(await vendedor("/inicio", 200), "alertas"), false);
    await dueno("/productos-imagenes/" + idProducto, 400, put({ favorito: true }));
    await dueno("/productos-imagenes/99999999999", 404, put({ favorito: true }));
    assert.equal((await dueno("/caja/turnos/" + turnoId, 200)).ventas.length, 2);
    const lecturasCaja = ["SAB_API_CAJA_TURNO_PAGOS", "SAB_API_CAJA_TURNO_RESUMEN",
      "SAB_API_CAJA_TURNO_BORRADORES", "SAB_API_CAJA_TURNO_EVENTOS"];
    for (const nombre of lecturasCaja) {
      const resultado = await consultarProcedimiento(conexion, nombre, { actorId: otroVendedor, turnoId });
      assert.ok(resultado.length > 0, "Un vendedor activo puede consultar un turno abierto");
    }
    await dueno("/caja/turnos/" + turnoId + "/cierre", 200, post({ efectivo: 10, tarjeta: 0, transferencia: 0 }));
    assert.equal((await dueno("/caja/turnos?pagina=1", 200)).turnos[0].ID_TURNO_CAJA, turnoId);
    await vendedor("/caja/turnos/" + turnoId, 404);
    for (const nombre of lecturasCaja) {
      assert.ok((await consultarProcedimiento(conexion, nombre, { actorId: idUsuario, turnoId })).length > 0);
      assert.deepEqual(await consultarProcedimiento(conexion, nombre, { actorId: vendedorId, turnoId }), []);
    }
    assert.deepEqual(await consultarProcedimiento(conexion, "SAB_API_CAJA_TURNO_VENTAS", {
      actorId: vendedorId, dueno: 0, turnoId, desplazamiento: 0
    }), []);

    const dia = 86_400_000;
    const desde = new Date(Date.now() - 2 * dia).toISOString().slice(0, 10);
    const hasta = new Date(Date.now() + 2 * dia).toISOString().slice(0, 10);
    const rango = "?desde=" + desde + "&hasta=" + hasta + "&agrupacion=semana";
    const secciones = ["resumen", "ventas", "productos", "pagos", "compras", "inventario", "movimientos", "caja", "vendedores"];
    for (const seccion of secciones) {
      const resultado = await dueno("/reportes/" + seccion + rango, 200);
      if (seccion === "ventas") assert.equal(resultado.indicadores.INGRESOS, 10);
      if (seccion === "compras") assert.equal(resultado.indicadores.GASTOS, 10);
    }
    assert.equal(Object.keys(await dueno("/reportes/catalogos", 200)).length, 7);
    await vendedor("/reportes/ventas" + rango, 403);
    assert.ok((await dueno("/reportes/ventas/csv" + rango, 200)).includes("CONFIRMADA"));
    assert.equal((await dueno("/reportes/ventas/pdf" + rango, 200)).subarray(0, 4).toString(), "%PDF");
    await dueno("/productos/" + idProducto, 200, { method: "DELETE" });
    await dueno("/productos/" + idProducto, 409, { method: "DELETE" });
    await dueno("/productos/" + idProducto, 409, put(producto));
    await dueno("/vendedores/" + vendedorId, 200, put({ ...cuentaVendedor, password: clave + "-nueva" }));
    await vendedor("/auth/yo", 401);
    await comprobarConcurrencia(conexion, credenciales, { actorId: idUsuario, vendedorId, otroVendedor, cajaId: caja.ID_CAJA, idProveedor, idInsumo });
    console.log("Autenticación, diagnóstico, Productos, Compras, Inventario, Vendedores, Caja, Ventas, Inicio, Imágenes y Reportes verificados contra Oracle aislado.");
  } finally {
    if (servidor && servidor.exitCode === null) {
      const cerrado = once(servidor, "exit");
      servidor.kill();
      await cerrado;
    }
    await conexion.close();
  }
}

comprobar().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
