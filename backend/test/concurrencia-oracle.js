const assert = require("node:assert/strict");
const { setTimeout: esperar } = require("node:timers/promises");
const oracledb = require("oracledb");
const { consultarProcedimiento, ejecutarProcedimiento, entradaClob, numeroSalida } = require("../src/config/procedimientos");

function observar(promesa) {
  let terminado = false;
  const resultado = promesa.then((valor) => ({ valor }), (error) => ({ error })).finally(() => { terminado = true; });
  return { resultado, terminado: () => terminado };
}

async function comprobarHorarios(a, b, { actorId, vendedorId, otroVendedor, cajaId }) {
  const datos = (dia, inicio, fin, vendedor = vendedorId) => ({ vendedorId: vendedor, cajaId, dia, inicio, fin, estado: "S" });
  const crear = (c, horario) => ejecutarProcedimiento(c, "SAB_C_HORARIO_VENDEDOR", { actorId, ...horario, resultado: numeroSalida });
  const editar = (c, id, horario) => ejecutarProcedimiento(c, "SAB_U_HORARIO_VENDEDOR", { actorId, id, ...horario });

  async function disputar(primera, segunda) {
    await a.execute("SELECT ID_USUARIO FROM USUARIO WHERE ID_USUARIO = :vendedorId FOR UPDATE", { vendedorId });
    const pendiente = observar(segunda());
    try {
      await esperar(250);
      assert.equal(pendiente.terminado(), false, "La segunda sesión debe esperar la fila del vendedor");
      await primera();
    } finally {
      await a.rollback();
    }
    const { error } = await pendiente.resultado;
    assert.equal(error?.errorNum, 20554, "Tras el COMMIT debe volver a consultar el solape");
  }

  const primerHorario = datos("MIERCOLES", "10:00", "11:00");
  await disputar(() => crear(a, primerHorario), () => crear(b, primerHorario));

  const { resultado: idA } = await crear(a, datos("JUEVES", "08:00", "09:00"));
  const { resultado: idB } = await crear(a, datos("JUEVES", "11:00", "12:00"));
  const nuevoHorario = datos("JUEVES", "09:30", "10:30");
  await disputar(() => editar(a, idA, nuevoHorario), () => editar(b, idB, nuevoHorario));

  const { resultado: idOtro } = await crear(a, datos("VIERNES", "10:00", "11:00", otroVendedor));
  const destino = datos("VIERNES", "10:00", "11:00");
  await disputar(() => crear(a, destino), () => editar(b, idOtro, destino));

  const horarios = await consultarProcedimiento(a, "SAB_API_VENDEDOR_HORARIOS", { actorId });
  assert.equal(horarios.filter((h) => h.ID_USUARIO === vendedorId && h.DIA_SEMANA === "MIERCOLES").length, 1);
  assert.equal(horarios.find((h) => h.ID_HORARIO === idB).HORA_INICIO, "11:00");
  assert.equal(horarios.find((h) => h.ID_HORARIO === idOtro).ID_USUARIO, otroVendedor);
  console.log("Horarios Oracle: alta/alta, edición/edición y alta/reasignación sincronizadas entre sesiones (20554).");
}

async function comprobarCompras(a, b, { actorId, idProveedor, idInsumo }) {
  const crear = (nombre, barra) => ejecutarProcedimiento(a, "SAB_C_PRODUCTO", {
    actorId, categoria: 1, unidad: 1, marca: 1, barra, nombre, costo: 2, precio: 10,
    stockCritico: 0, estado: "S", resultado: numeroSalida
  });
  const { resultado: menor } = await crear("Producto de concurrencia A", "QACOMPRA01");
  const { resultado: mayor } = await crear("Producto de concurrencia B", "QACOMPRA02");
  assert.ok(menor < mayor);
  const item = (tipo, id_articulo, costo_unitario = 2) => ({ tipo, id_articulo, id_proveedor: idProveedor, cantidad: 1, costo_unitario });
  const productos = [item("PRODUCTO", menor), item("PRODUCTO", mayor)];
  const insumo = item("INSUMO", idInsumo);
  const natural = [...productos, insumo];
  const inversa = [...natural].reverse();
  const comprar = (c, articulos) => ejecutarProcedimiento(c, "SAB_COMPRA_MULTIPLE", {
    actorId, articulos: entradaClob(JSON.stringify(articulos)), cantidad: numeroSalida, total: numeroSalida
  });
  const [insumoOriginal] = (await consultarProcedimiento(a, "SAB_L_INSUMO", { actorId })).filter((i) => i.ID_INSUMO === idInsumo);

  await a.execute("SELECT ID_PRODUCTO FROM PRODUCTO WHERE ID_PRODUCTO = :menor FOR UPDATE", { menor });
  const pendiente = observar(comprar(b, inversa));
  try {
    await esperar(250);
    assert.equal(pendiente.terminado(), false, "La compra debe esperar el menor ID");
    await a.execute("SELECT ID_PRODUCTO FROM PRODUCTO WHERE ID_PRODUCTO = :mayor FOR UPDATE NOWAIT", { mayor });
    await a.execute("SELECT ID_INSUMO FROM INSUMO WHERE ID_INSUMO = :idInsumo FOR UPDATE NOWAIT", { idInsumo });
  } finally {
    await a.rollback();
  }
  assert.deepEqual((await pendiente.resultado).valor, { cantidad: 3, total: 6 });
  assert.deepEqual(await Promise.all([comprar(a, natural), comprar(b, inversa)]), [
    { cantidad: 3, total: 6 }, { cantidad: 3, total: 6 }
  ]);
  await assert.rejects(comprar(a, [productos[0], item("INSUMO", 9999999999)]), { errorNum: 20183 });
  await assert.rejects(comprar(a, [productos[0], { ...insumo, cantidad: "1" }]), { errorNum: 20211 });

  const repetidos = await comprar(a, [item("INSUMO", idInsumo, 3), item("INSUMO", idInsumo, 4)]);
  assert.deepEqual(repetidos, { cantidad: 2, total: 7 });
  const final = (await consultarProcedimiento(a, "SAB_L_INSUMO", { actorId })).find((i) => i.ID_INSUMO === idInsumo);
  assert.equal(final.STOCK_ACTUAL, insumoOriginal.STOCK_ACTUAL + 5);
  assert.equal(final.COSTO_UNITARIO, 4, "Los artículos repetidos se aplican en el orden del formulario");
  const stocks = (await consultarProcedimiento(a, "SAB_L_PRODUCTO", { actorId })).filter((p) => [menor, mayor].includes(p.ID_PRODUCTO));
  assert.equal(stocks.length, 2);
  assert.deepEqual(stocks.map((p) => p.STOCK_ACTUAL), [3, 3]);
  const { rows } = await a.execute(
    "SELECT COUNT(*) FROM ABASTECIMIENTO_PROVEEDOR WHERE ID_PRODUCTO IN (:menor, :mayor)", { menor, mayor }
  );
  assert.deepEqual(rows, [[6]]);
  console.log("Compras Oracle: orden producto/ID/insumo comprobado con NOWAIT, dos lotes opuestos confirmados, rollback e insumo repetido verificados.");
}

async function comprobarUnidades(a, b, { actorId, idProveedor }) {
  const unidad = { codigo: "QACON", nombre: "Unidad concurrencia QA" };
  const { resultado: id } = await ejecutarProcedimiento(a, "SAB_C_UNIDAD_MEDIDA", {
    actorId, ...unidad, decimales: "N", resultado: numeroSalida
  });
  await a.execute("SELECT ID_UNIDAD FROM UNIDAD_MEDIDA WHERE ID_UNIDAD = :id FOR UPDATE", { id });
  const pendiente = observar(ejecutarProcedimiento(b, "SAB_C_INSUMO", {
    actorId, unidad: id, proveedor: idProveedor, nombre: "Insumo unidad concurrencia QA",
    costo: 2, stock: 0.5, critico: 0, estado: "S", resultado: numeroSalida
  }));
  const editar = (decimales) => ejecutarProcedimiento(a, "SAB_U_UNIDAD_MEDIDA", { actorId, id, ...unidad, decimales });
  try {
    await esperar(250);
    assert.equal(pendiente.terminado(), false, "El alta espera a que termine el cambio de unidad");
    await editar("S");
  } finally {
    await a.rollback();
  }
  const { valor, error } = await pendiente.resultado;
  if (error) throw error;
  await assert.rejects(editar("N"), { errorNum: 20557 });
  await ejecutarProcedimiento(a, "SAB_D_INSUMO", { actorId, id: valor.resultado });
  await ejecutarProcedimiento(a, "SAB_D_UNIDAD_MEDIDA", { actorId, id });
  console.log("Unidades Oracle: un alta concurrente usó la regla decimal confirmada y el cambio posterior se rechazó por referencia.");
}

async function comprobarConcurrencia(conexion, credenciales, datos) {
  assert.match(credenciales.user, /^SAB_QA_[A-Z0-9]+$/);
  const segunda = await oracledb.getConnection(credenciales);
  conexion.callTimeout = 8000;
  segunda.callTimeout = 8000;
  try {
    await comprobarHorarios(conexion, segunda, datos);
    await comprobarCompras(conexion, segunda, datos);
    await comprobarUnidades(conexion, segunda, datos);
  } finally {
    await segunda.close();
  }
}

module.exports = { comprobarConcurrencia };
