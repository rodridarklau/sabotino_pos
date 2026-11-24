// Consultas analíticas contra filas simuladas en CTE. No crea objetos ni escribe en Oracle.
const assert = require("node:assert/strict");
const oracledb = require("oracledb");
const db = require("../src/config/database");
const { leer, filtros } = require("../src/services/reportes");

const simuladas = `
VENTA (ID_VENTA, ID_USUARIO, ID_TURNO_CAJA, ESTADO_VENTA, TOTAL_VENTA, FECHA_HORA_VENTA) AS (
  SELECT 1, 1, 1, 'CONFIRMADA', 100, TIMESTAMP '2026-11-02 00:00:00' FROM DUAL UNION ALL
  SELECT 2, 1, 1, 'CONFIRMADA', 30, TIMESTAMP '2026-11-02 23:59:59.999999' FROM DUAL UNION ALL
  SELECT 3, 1, 2, 'BORRADOR', 999, TIMESTAMP '2026-11-02 14:00:00' FROM DUAL UNION ALL
  SELECT 4, 1, 1, 'CONFIRMADA', 25, TIMESTAMP '2026-11-01 18:00:00' FROM DUAL UNION ALL
  SELECT 5, 1, 2, 'CONFIRMADA', 700, TIMESTAMP '2026-11-03 00:00:00' FROM DUAL
),
DETALLE_VENTA (ID_VENTA, ID_PRODUCTO, CANTIDAD, SUBTOTAL_LINEA, PRECIO_UNITARIO_HISTORICO) AS (
  SELECT 1, 1, 2, 70, 35 FROM DUAL UNION ALL
  SELECT 1, 2, .5, 30, 60 FROM DUAL UNION ALL
  SELECT 2, 1, 3, 30, 10 FROM DUAL UNION ALL
  SELECT 3, 1, 1, 999, 999 FROM DUAL
),
PAGO_VENTA (ID_PAGO_VENTA, ID_VENTA, ID_METODO_PAGO, MONTO_PAGADO) AS (
  SELECT 1, 1, 1, 40 FROM DUAL UNION ALL SELECT 2, 1, 2, 60 FROM DUAL UNION ALL
  SELECT 3, 2, 1, 30 FROM DUAL UNION ALL SELECT 4, 3, 1, 999 FROM DUAL
),
METODO_PAGO (ID_METODO_PAGO, NOMBRE_METODO) AS (
  SELECT 1, 'EFECTIVO' FROM DUAL UNION ALL SELECT 2, 'TARJETA' FROM DUAL UNION ALL SELECT 3, 'TRANSFERENCIA' FROM DUAL
),
PRODUCTO (ID_PRODUCTO, ID_CATEGORIA, ID_UNIDAD, NOMBRE_PRODUCTO, PRECIO_VENTA_ACTUAL) AS (
  SELECT 1, 1, 1, 'Tarta', 5000 FROM DUAL UNION ALL SELECT 2, 1, 2, 'Pan', 6000 FROM DUAL
),
CATEGORIA_PRODUCTO (ID_CATEGORIA, NOMBRE_CATEGORIA) AS (SELECT 1, 'Pastelería' FROM DUAL),
UNIDAD_MEDIDA (ID_UNIDAD, CODIGO_UNIDAD) AS (SELECT 1, 'UN' FROM DUAL UNION ALL SELECT 2, 'KG' FROM DUAL),
USUARIO (ID_USUARIO, ID_ROL, NOMBRE_COMPLETO) AS (SELECT 1, 1, 'Vendedor simulado' FROM DUAL),
ROL_USUARIO (ID_ROL, NOMBRE_ROL) AS (SELECT 1, 'VENDEDOR' FROM DUAL),
CAJA_TERMINAL (ID_CAJA, NOMBRE_CAJA) AS (SELECT 1, 'Caja simulada' FROM DUAL),
TURNO_CAJA (ID_TURNO_CAJA, ID_CAJA, ESTADO_TURNO, ID_USUARIO_APERTURA, ID_USUARIO_CIERRE,
  FECHA_HORA_APERTURA, FECHA_HORA_CIERRE, INICIAL_EFECTIVO, INICIAL_TARJETA, INICIAL_TRANSFERENCIA,
  CIERRE_SISTEMA_EFECTIVO, CIERRE_SISTEMA_TARJETA, CIERRE_SISTEMA_TRANSFERENCIA,
  CIERRE_REAL_EFECTIVO, CIERRE_REAL_TARJETA, CIERRE_REAL_TRANSFERENCIA) AS (
  SELECT 1,1,'CERRADO',1,1,TIMESTAMP '2026-11-01 17:00:00',TIMESTAMP '2026-11-02 23:59:59',
    20,0,0,90,60,0,88.75,60,0 FROM DUAL UNION ALL
  SELECT 2,1,'ABIERTO',1,NULL,TIMESTAMP '2026-11-02 14:00:00',CAST(NULL AS TIMESTAMP),
    10,0,0,NULL,NULL,NULL,NULL,NULL,NULL FROM DUAL
),
ABASTECIMIENTO_PROVEEDOR (ID_ABASTECIMIENTO, FECHA_COMPRA, ID_PROVEEDOR, ID_PRODUCTO, CANTIDAD_COMPRADA, COSTO_UNITARIO_COMPRA) AS (
  SELECT 1,TIMESTAMP '2026-11-02 10:00:00',1,1,2.123,10.01 FROM DUAL UNION ALL
  SELECT 2,TIMESTAMP '2026-11-02 13:00:00',1,2,1.234,50.02 FROM DUAL
),
PROVEEDOR (ID_PROVEEDOR, RAZON_SOCIAL) AS (SELECT 1, 'Proveedor simulado' FROM DUAL)
`;

async function comprobar() {
  require("dotenv").config({ quiet: true });
  await db.iniciarBaseDatos();
  let conexion;
  try {
    conexion = await db.obtenerConexion();
    const lectura = {
      execute(sql, ...args) {
        assert.match(sql, /^WITH /);
        assert.doesNotMatch(sql, /;|\bFOR\s+UPDATE\b|\.NEXTVAL\b/i);
        const ctes = simuladas.trim().split(/,\n(?=[A-Z_]+ \()/).filter((cte) =>
          new RegExp(`\\b(?:FROM|JOIN) ${cte.split(" ")[0]}\\b`).test(sql));
        return conexion.execute(`WITH ${ctes.join(",\n")}, ${sql.slice(5)}`.replace(/\bSELECT\b/g, "SELECT /*+ NO_QUERY_TRANSFORMATION */"), ...args);
      }
    };
    const rango = { desde: "2026-11-02", hasta: "2026-11-02" };
    const consultar = (seccion, adicionales = {}) => leer(lectura, seccion, filtros({ ...rango, ...adicionales }));
    const ventas = await consultar("ventas");
    assert.deepEqual(ventas.indicadores, {
      TRANSACCIONES: 2, INGRESOS: 130, TICKET: 65,
      TRANSACCIONES_ANTERIOR: 1, INGRESOS_ANTERIOR: 25, TICKET_ANTERIOR: 25
    });
    assert.equal(ventas.tabla.length, 3);
    assert.deepEqual(ventas.cantidades, [{ UNIDAD: "KG", CANTIDAD: .5 }, { UNIDAD: "UN", CANTIDAD: 5 }]);
    assert.equal((await consultar("ventas", { metodo: "2", producto: "1" })).indicadores.INGRESOS, 100);
    assert.equal((await consultar("ventas", { estado: "BORRADOR" })).tabla.length, 1);
    const productos = await consultar("productos");
    assert.deepEqual(productos.tabla.map((p) => [p.INGRESOS, p.PRECIO_MIN, p.PRECIO_MAX, p.TRANSACCIONES]),
      [[100, 10, 35, 2], [30, 60, 60, 1]]);
    assert.equal((await consultar("productos", { orden: "cantidad", unidad: "2" })).tabla[0].UNIDAD, "KG");
    const pagos = await consultar("pagos");
    assert.deepEqual(pagos.metodos.map((p) => [p.METODO, p.PAGOS, p.IMPORTE]), [
      ["EFECTIVO", 2, 70], ["TARJETA", 1, 60], ["TRANSFERENCIA", 0, 0]
    ]);
    assert.ok(pagos.metodos.every((p) => p.TOTAL_PAGOS === 130));
    const compras = await consultar("compras");
    assert.equal(compras.indicadores.ABASTECIMIENTOS, 2);
    assert.equal(compras.indicadores.GASTOS, 82.97);
    const caja = await consultar("caja");
    assert.equal(caja.indicadores.ABIERTOS, 1);
    assert.equal(caja.indicadores.CERRADOS, 1);
    assert.equal(caja.indicadores.DESCUADRE, -1.25);
    assert.equal(caja.tabla.find((t) => t.ESTADO === "CERRADO").ESP_EFECTIVO, 90);
    assert.equal(caja.tabla.find((t) => t.ESTADO === "CERRADO").TRANSACCIONES, 3);
    const sinDatos = await consultar("ventas", { desde: "2026-10-01", hasta: "2026-10-01" });
    assert.equal(sinDatos.indicadores.INGRESOS, 0);
    assert.equal(sinDatos.indicadores.TICKET, null);
    assert.equal(sinDatos.tabla.length, 0);
    console.log("Cálculos Oracle verificados con CTE simuladas, sin cambios en la base.");
  } finally {
    if (conexion) await conexion.close();
    await oracledb.getPool().close();
  }
}

comprobar().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
