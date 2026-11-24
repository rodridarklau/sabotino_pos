const { filas } = require("./caja-ventas");

const dia = 86400000;
const ids = ["vendedor", "caja", "producto", "categoria", "metodo", "proveedor", "unidad"];
const estados = ["CONFIRMADA", "BORRADOR", "ANULADA"];
const secciones = ["resumen", "ventas", "productos", "pagos", "compras", "inventario", "movimientos", "caja", "vendedores"];
const paginaTam = 25;
const maxExportacion = 1000;

function fecha(texto) {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return NaN;
  const resultado = Date.parse(texto);
  return Number.isFinite(resultado) && new Date(resultado).toISOString().slice(0, 10) === texto ? resultado : NaN;
}

function filtros(query) {
  const inicio = fecha(query.desde);
  const fin = fecha(query.hasta);
  if (!(inicio >= fecha("1902-01-01") && fin >= inicio && fin - inicio < 366 * dia && fin <= fecha("9998-12-31"))) return null;
  const resultado = {
    desde: query.desde, hasta: query.hasta,
    anterior: new Date(inicio - (fin - inicio) - dia).toISOString().slice(0, 10),
    agrupacion: query.agrupacion ?? "dia", estado: query.estado ?? "TODOS",
    orden: query.orden ?? "ingreso", top: Number(query.top ?? 10), pagina: Number(query.pagina ?? 1)
  };
  if (!["dia", "semana", "mes", "anio"].includes(resultado.agrupacion)
      || !["TODOS", ...estados].includes(resultado.estado)
      || !["ingreso", "cantidad"].includes(resultado.orden)
      || ![5, 10, 20].includes(resultado.top)
      || !Number.isSafeInteger(resultado.pagina) || resultado.pagina < 1 || resultado.pagina > 100000) return null;
  for (const id of ids) {
    const valor = query[id];
    if (valor !== undefined && (typeof valor !== "string" || !/^\d{1,10}$/.test(valor) || Number(valor) < 1)) return null;
    resultado[id] = valor === undefined ? null : Number(valor);
  }
  if (query.periodo !== undefined && !Number.isFinite(fecha(query.periodo))) return null;
  resultado.periodo = query.periodo ?? null;
  return resultado;
}

const inicio = "TO_TIMESTAMP(:desde, 'YYYY-MM-DD')";
const fin = "TO_TIMESTAMP(:hasta, 'YYYY-MM-DD') + INTERVAL '1' DAY";
const previo = "TO_TIMESTAMP(:anterior, 'YYYY-MM-DD')";
const rango = (col, desde = inicio, hasta = fin) => `${col} >= ${desde} AND ${col} < ${hasta}`;
const filtro = (col, id) => `(:${id} IS NULL OR ${col} = :${id})`;
const fechaHora = (col) => `TO_CHAR(${col}, 'YYYY-MM-DD HH24:MI:SS')`;
const bucket = (col, f) => `TO_CHAR(TRUNC(${col}, '${{ dia: "DD", semana: "IW", mes: "MM", anio: "YYYY" }[f.agrupacion]}'), 'YYYY-MM-DD')`;

const ventas = `SELECT V.ID_VENTA, V.ID_USUARIO, V.ID_TURNO_CAJA, V.ESTADO_VENTA, V.TOTAL_VENTA, V.FECHA_HORA_VENTA
  FROM VENTA V JOIN TURNO_CAJA T ON T.ID_TURNO_CAJA = V.ID_TURNO_CAJA
  WHERE ${rango("V.FECHA_HORA_VENTA", previo)}
    AND ${filtro("T.ID_CAJA", "caja")} AND ${filtro("V.ID_USUARIO", "vendedor")}
    AND ((:producto IS NULL AND :categoria IS NULL) OR EXISTS (
      SELECT 1 FROM DETALLE_VENTA D JOIN PRODUCTO P ON P.ID_PRODUCTO = D.ID_PRODUCTO
      WHERE D.ID_VENTA = V.ID_VENTA AND ${filtro("P.ID_PRODUCTO", "producto")} AND ${filtro("P.ID_CATEGORIA", "categoria")}
    )) AND (:metodo IS NULL OR EXISTS (
      SELECT 1 FROM PAGO_VENTA M WHERE M.ID_VENTA = V.ID_VENTA AND M.ID_METODO_PAGO = :metodo
    ))`;
const confirmadas = "V.ESTADO_VENTA = 'CONFIRMADA'";
const actual = `V.FECHA_HORA_VENTA >= ${inicio}`;
const ventasCte = `WITH V AS (${ventas})`;

const compras = `SELECT A.ID_ABASTECIMIENTO, A.FECHA_COMPRA, A.ID_PROVEEDOR, A.ID_PRODUCTO,
    P.NOMBRE_PRODUCTO AS PRODUCTO, R.RAZON_SOCIAL AS PROVEEDOR, U.CODIGO_UNIDAD AS UNIDAD,
    A.CANTIDAD_COMPRADA AS CANTIDAD, A.COSTO_UNITARIO_COMPRA AS COSTO,
    ROUND(A.CANTIDAD_COMPRADA * A.COSTO_UNITARIO_COMPRA, 2) AS IMPORTE
  FROM ABASTECIMIENTO_PROVEEDOR A JOIN PRODUCTO P ON P.ID_PRODUCTO = A.ID_PRODUCTO
  JOIN PROVEEDOR R ON R.ID_PROVEEDOR = A.ID_PROVEEDOR JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = P.ID_UNIDAD
  WHERE ${rango("A.FECHA_COMPRA", previo)}
    AND ${filtro("A.ID_PROVEEDOR", "proveedor")} AND ${filtro("P.ID_PRODUCTO", "producto")}
    AND ${filtro("P.ID_CATEGORIA", "categoria")}`;
const comprasCte = `WITH B AS (${compras})`;
const compraActual = `B.FECHA_COMPRA >= ${inicio}`;

const stock = `SELECT 'Producto' AS TIPO, P.ID_PRODUCTO AS ID, P.NOMBRE_PRODUCTO AS ARTICULO,
    A.NOMBRE_CATEGORIA AS CATEGORIA, U.CODIGO_UNIDAD AS UNIDAD, P.STOCK_ACTUAL, P.STOCK_CRITICO
  FROM PRODUCTO P JOIN CATEGORIA_PRODUCTO A ON A.ID_CATEGORIA = P.ID_CATEGORIA
  JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = P.ID_UNIDAD
  WHERE P.ESTADO_PRODUCTO = 'S' AND ${filtro("P.ID_PRODUCTO", "producto")}
    AND ${filtro("P.ID_CATEGORIA", "categoria")} AND ${filtro("P.ID_UNIDAD", "unidad")}
  UNION ALL
  SELECT 'Insumo', I.ID_INSUMO, I.NOMBRE_INSUMO, NULL, U.CODIGO_UNIDAD, I.STOCK_ACTUAL, I.STOCK_CRITICO
  FROM INSUMO I JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = I.ID_UNIDAD
  WHERE I.ESTADO_ACTIVO = 'S' AND :producto IS NULL AND :categoria IS NULL AND ${filtro("I.ID_UNIDAD", "unidad")}`;
const stockResumen = `WITH S AS (${stock}) SELECT
  COUNT(CASE WHEN TIPO = 'Producto' THEN 1 END) AS PRODUCTOS,
  COUNT(CASE WHEN TIPO = 'Insumo' THEN 1 END) AS INSUMOS,
  COUNT(CASE WHEN TIPO = 'Producto' AND STOCK_ACTUAL <= STOCK_CRITICO THEN 1 END) AS PRODUCTOS_CRITICOS,
  COUNT(CASE WHEN TIPO = 'Insumo' AND STOCK_ACTUAL <= STOCK_CRITICO THEN 1 END) AS INSUMOS_CRITICOS,
  COUNT(CASE WHEN STOCK_ACTUAL = 0 THEN 1 END) AS AGOTADOS FROM S`;

const turnos = `SELECT T.*, CAST(T.FECHA_HORA_CIERRE AS DATE) - CAST(T.FECHA_HORA_APERTURA AS DATE) AS DURACION_DIAS,
    (T.CIERRE_REAL_EFECTIVO - T.CIERRE_SISTEMA_EFECTIVO
     + T.CIERRE_REAL_TARJETA - T.CIERRE_SISTEMA_TARJETA
     + T.CIERRE_REAL_TRANSFERENCIA - T.CIERRE_SISTEMA_TRANSFERENCIA) AS DESCUADRE
  FROM TURNO_CAJA T WHERE ${filtro("T.ID_CAJA", "caja")}
    AND (:vendedor IS NULL OR :vendedor IN (T.ID_USUARIO_APERTURA, T.ID_USUARIO_CIERRE))`;
const turnosCte = `WITH T AS (${turnos})`;
const turnoIncluido = `(T.ESTADO_TURNO = 'ABIERTO' OR ${rango("T.FECHA_HORA_CIERRE")})`;
const cajaResumen = `${turnosCte} SELECT
    COUNT(CASE WHEN ESTADO_TURNO = 'ABIERTO' THEN 1 END) AS ABIERTOS,
    COUNT(CASE WHEN ${rango("T.FECHA_HORA_CIERRE")} THEN 1 END) AS CERRADOS,
    COUNT(CASE WHEN ${rango("T.FECHA_HORA_CIERRE")} AND DESCUADRE <> 0 THEN 1 END) AS CON_DESCUADRE,
    NVL(SUM(CASE WHEN ${rango("T.FECHA_HORA_CIERRE")} THEN DESCUADRE END),0) AS DESCUADRE,
    COUNT(CASE WHEN ${rango("T.FECHA_HORA_CIERRE", previo, inicio)} THEN 1 END) AS CERRADOS_ANTERIOR,
    NVL(SUM(CASE WHEN ${rango("T.FECHA_HORA_CIERRE", previo, inicio)} THEN DESCUADRE END),0) AS DESCUADRE_ANTERIOR
  FROM T WHERE T.ESTADO_TURNO = 'ABIERTO' OR ${rango("T.FECHA_HORA_CIERRE", previo)}`;

function plan(seccion, f) {
  const fechaVenta = bucket("V.FECHA_HORA_VENTA", f);
  const resumenVentas = `${ventasCte} SELECT
    COUNT(CASE WHEN ${actual} AND ${confirmadas} THEN 1 END) AS TRANSACCIONES,
    NVL(SUM(CASE WHEN ${actual} AND ${confirmadas} THEN TOTAL_VENTA END), 0) AS INGRESOS,
    ROUND(AVG(CASE WHEN ${actual} AND ${confirmadas} THEN TOTAL_VENTA END),2) AS TICKET,
    COUNT(CASE WHEN NOT (${actual}) AND ${confirmadas} THEN 1 END) AS TRANSACCIONES_ANTERIOR,
    NVL(SUM(CASE WHEN NOT (${actual}) AND ${confirmadas} THEN TOTAL_VENTA END),0) AS INGRESOS_ANTERIOR,
    ROUND(AVG(CASE WHEN NOT (${actual}) AND ${confirmadas} THEN TOTAL_VENTA END),2) AS TICKET_ANTERIOR
    FROM V`;
  const cantidades = `${ventasCte} SELECT U.CODIGO_UNIDAD AS UNIDAD, SUM(D.CANTIDAD) AS CANTIDAD
    FROM V JOIN DETALLE_VENTA D ON D.ID_VENTA = V.ID_VENTA JOIN PRODUCTO P ON P.ID_PRODUCTO = D.ID_PRODUCTO
    JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = P.ID_UNIDAD
    WHERE ${actual} AND ${confirmadas} AND ${filtro("P.ID_PRODUCTO", "producto")} AND ${filtro("P.ID_CATEGORIA", "categoria")}
    GROUP BY U.CODIGO_UNIDAD ORDER BY U.CODIGO_UNIDAD`;
  const resumenCompras = `${comprasCte} SELECT
    COUNT(CASE WHEN ${compraActual} THEN 1 END) AS ABASTECIMIENTOS,
    NVL(SUM(CASE WHEN ${compraActual} THEN IMPORTE END),0) AS GASTOS,
    NVL(SUM(CASE WHEN NOT (${compraActual}) THEN IMPORTE END),0) AS GASTOS_ANTERIOR FROM B`;

  switch (seccion) {
    case "resumen":
      return { indicadores: resumenVentas, compras: resumenCompras, stock: stockResumen, caja: cajaResumen, cantidades };
    case "ventas":
      return {
        indicadores: resumenVentas, cantidades,
        serie: `${ventasCte} SELECT CASE WHEN ${actual} THEN 'Actual' ELSE 'Anterior' END AS PERIODO,
          ${fechaVenta} AS FECHA, COUNT(*) AS TRANSACCIONES, SUM(V.TOTAL_VENTA) AS INGRESOS
          FROM V WHERE ${confirmadas}
          GROUP BY CASE WHEN ${actual} THEN 'Actual' ELSE 'Anterior' END, ${fechaVenta} ORDER BY FECHA`,
        actividad: `${ventasCte}, DIAS AS (SELECT TO_DATE(:desde,'YYYY-MM-DD') + LEVEL - 1 AS DIA
          FROM DUAL CONNECT BY LEVEL <= TO_DATE(:hasta,'YYYY-MM-DD') - TO_DATE(:desde,'YYYY-MM-DD') + 1),
          ACTIVIDAD AS (SELECT DIAS.DIA, COUNT(V.ID_VENTA) AS TRANSACCIONES
           FROM DIAS LEFT JOIN V ON V.FECHA_HORA_VENTA >= DIAS.DIA AND V.FECHA_HORA_VENTA < DIAS.DIA + 1
             AND ${confirmadas} GROUP BY DIAS.DIA),
          EXTREMOS AS (SELECT DIA, TRANSACCIONES,
            ROW_NUMBER() OVER(ORDER BY TRANSACCIONES DESC, DIA) MAYOR,
            ROW_NUMBER() OVER(ORDER BY TRANSACCIONES, DIA) MENOR FROM ACTIVIDAD)
          SELECT TO_CHAR(DIA,'YYYY-MM-DD') AS FECHA, TRANSACCIONES, MAYOR, MENOR
          FROM EXTREMOS WHERE MAYOR = 1 OR MENOR = 1 ORDER BY MAYOR`,
        tabla: `${ventasCte} SELECT V.ID_VENTA AS ID, ${fechaHora("V.FECHA_HORA_VENTA")} AS FECHA,
          U.NOMBRE_COMPLETO AS RESPONSABLE, C.NOMBRE_CAJA AS CAJA, V.ESTADO_VENTA AS ESTADO, V.TOTAL_VENTA AS IMPORTE
          FROM V JOIN USUARIO U ON U.ID_USUARIO = V.ID_USUARIO
          JOIN TURNO_CAJA T ON T.ID_TURNO_CAJA = V.ID_TURNO_CAJA JOIN CAJA_TERMINAL C ON C.ID_CAJA = T.ID_CAJA
          WHERE ${actual} AND (:estado = 'TODOS' OR V.ESTADO_VENTA = :estado)
            AND (:periodo IS NULL OR ${fechaVenta} = :periodo)
          ORDER BY V.FECHA_HORA_VENTA DESC, V.ID_VENTA DESC`
      };
    case "productos":
      return { tabla: `${ventasCte} SELECT P.NOMBRE_PRODUCTO AS PRODUCTO, C.NOMBRE_CATEGORIA AS CATEGORIA,
          U.CODIGO_UNIDAD AS UNIDAD, SUM(D.CANTIDAD) AS CANTIDAD, SUM(D.SUBTOTAL_LINEA) AS INGRESOS,
          COUNT(DISTINCT V.ID_VENTA) AS TRANSACCIONES, MIN(D.PRECIO_UNITARIO_HISTORICO) AS PRECIO_MIN,
          MAX(D.PRECIO_UNITARIO_HISTORICO) AS PRECIO_MAX
        FROM V JOIN DETALLE_VENTA D ON D.ID_VENTA = V.ID_VENTA JOIN PRODUCTO P ON P.ID_PRODUCTO = D.ID_PRODUCTO
        JOIN CATEGORIA_PRODUCTO C ON C.ID_CATEGORIA = P.ID_CATEGORIA JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = P.ID_UNIDAD
        WHERE ${actual} AND ${confirmadas} AND ${filtro("P.ID_PRODUCTO", "producto")}
          AND ${filtro("P.ID_CATEGORIA", "categoria")} AND ${filtro("P.ID_UNIDAD", "unidad")}
        GROUP BY P.ID_PRODUCTO, P.NOMBRE_PRODUCTO, C.NOMBRE_CATEGORIA, U.CODIGO_UNIDAD
        ORDER BY ${f.orden === "cantidad" ? "SUM(D.CANTIDAD)" : "SUM(D.SUBTOTAL_LINEA)"} DESC, P.ID_PRODUCTO` };
    case "pagos": {
      const base = `FROM V JOIN PAGO_VENTA P ON P.ID_VENTA = V.ID_VENTA
        JOIN METODO_PAGO M ON M.ID_METODO_PAGO = P.ID_METODO_PAGO
        WHERE ${actual} AND ${confirmadas} AND ${filtro("P.ID_METODO_PAGO", "metodo")}`;
      const evolucion = `${ventasCte} SELECT ${fechaVenta} AS FECHA, M.NOMBRE_METODO AS METODO, COUNT(*) AS PAGOS,
          SUM(P.MONTO_PAGADO) AS IMPORTE ${base}
          GROUP BY ${fechaVenta}, M.NOMBRE_METODO ORDER BY FECHA DESC, METODO`;
      return {
        metodos: `${ventasCte}, MONTOS AS (SELECT M.ID_METODO_PAGO, COUNT(*) AS PAGOS, SUM(P.MONTO_PAGADO) AS IMPORTE
          ${base} GROUP BY M.ID_METODO_PAGO)
          SELECT M.NOMBRE_METODO AS METODO, NVL(P.PAGOS,0) AS PAGOS, NVL(P.IMPORTE,0) AS IMPORTE,
            NVL(ROUND(100*P.IMPORTE/NULLIF(SUM(P.IMPORTE) OVER (),0),2),0) AS PARTICIPACION,
            NVL(SUM(P.IMPORTE) OVER (),0) AS TOTAL_PAGOS
          FROM METODO_PAGO M LEFT JOIN MONTOS P ON P.ID_METODO_PAGO=M.ID_METODO_PAGO
          WHERE ${filtro("M.ID_METODO_PAGO", "metodo")} ORDER BY IMPORTE DESC, METODO`,
        serie: evolucion,
        tabla: evolucion
      };
    }
    case "compras":
      return {
        indicadores: resumenCompras,
        cantidades: `${comprasCte} SELECT UNIDAD, SUM(CANTIDAD) CANTIDAD FROM B
          WHERE ${compraActual} GROUP BY UNIDAD ORDER BY UNIDAD`,
        serie: `${comprasCte} SELECT ${bucket("B.FECHA_COMPRA", f)} AS FECHA, SUM(IMPORTE) AS GASTOS FROM B
          WHERE ${compraActual} GROUP BY ${bucket("B.FECHA_COMPRA", f)} ORDER BY FECHA`,
        proveedores: `${comprasCte} SELECT PROVEEDOR, SUM(IMPORTE) AS GASTOS FROM B WHERE ${compraActual}
          GROUP BY ID_PROVEEDOR, PROVEEDOR ORDER BY GASTOS DESC, ID_PROVEEDOR FETCH FIRST 10 ROWS ONLY`,
        productos: `${comprasCte} SELECT PRODUCTO, SUM(IMPORTE) AS GASTOS FROM B WHERE ${compraActual}
          GROUP BY ID_PRODUCTO, PRODUCTO ORDER BY GASTOS DESC, ID_PRODUCTO FETCH FIRST 10 ROWS ONLY`,
        tabla: `${comprasCte} SELECT ID_ABASTECIMIENTO AS ID, ${fechaHora("B.FECHA_COMPRA")} AS FECHA,
          PROVEEDOR, PRODUCTO, UNIDAD, CANTIDAD, COSTO, IMPORTE FROM B WHERE ${compraActual}
          ORDER BY B.FECHA_COMPRA DESC, ID_ABASTECIMIENTO DESC`
      };
    case "inventario":
      return {
        indicadores: stockResumen,
        tabla: `WITH S AS (${stock}) SELECT S.*, CASE WHEN STOCK_ACTUAL = 0 THEN 'Agotado'
          WHEN STOCK_ACTUAL <= STOCK_CRITICO THEN 'Crítico' ELSE 'Normal' END AS ESTADO FROM S
          ORDER BY CASE WHEN STOCK_ACTUAL = 0 THEN 0 WHEN STOCK_ACTUAL <= STOCK_CRITICO THEN 1 ELSE 2 END, TIPO, ARTICULO, ID`
      };
    case "movimientos":
      return { tabla: `SELECT A.ID_AJUSTE AS ID, ${fechaHora("A.FECHA_HORA_AJUSTE")} AS FECHA,
        P.NOMBRE_PRODUCTO AS PRODUCTO, T.NOMBRE_TIPO_AJUSTE AS TIPO, U.CODIGO_UNIDAD AS UNIDAD,
        T.FACTOR_OPERACION * A.CANTIDAD_AJUSTADA AS CANTIDAD, N.NOMBRE_COMPLETO AS RESPONSABLE, A.OBSERVACION
        FROM AJUSTE_INVENTARIO A JOIN PRODUCTO P ON P.ID_PRODUCTO = A.ID_PRODUCTO
        JOIN TIPO_AJUSTE_STOCK T ON T.ID_TIPO_AJUSTE = A.ID_TIPO_AJUSTE
        JOIN UNIDAD_MEDIDA U ON U.ID_UNIDAD = P.ID_UNIDAD JOIN USUARIO N ON N.ID_USUARIO = A.ID_USUARIO
        WHERE ${rango("A.FECHA_HORA_AJUSTE")} AND ${filtro("P.ID_PRODUCTO", "producto")}
          AND ${filtro("P.ID_CATEGORIA", "categoria")} AND ${filtro("P.ID_UNIDAD", "unidad")}
          AND ${filtro("A.ID_USUARIO", "vendedor")}
        ORDER BY A.FECHA_HORA_AJUSTE DESC, A.ID_AJUSTE DESC` };
    case "caja":
      return {
        indicadores: cajaResumen,
        serie: `${turnosCte} SELECT ${bucket("T.FECHA_HORA_CIERRE", f)} AS FECHA, SUM(DESCUADRE) AS DESCUADRE
          FROM T WHERE ${rango("T.FECHA_HORA_CIERRE")} GROUP BY ${bucket("T.FECHA_HORA_CIERRE", f)} ORDER BY FECHA`,
        tabla: `${turnosCte}, PAGOS AS (
            SELECT V.ID_TURNO_CAJA, P.ID_PAGO_VENTA, P.MONTO_PAGADO, M.NOMBRE_METODO
            FROM T JOIN VENTA V ON V.ID_TURNO_CAJA = T.ID_TURNO_CAJA
            JOIN PAGO_VENTA P ON P.ID_VENTA = V.ID_VENTA JOIN METODO_PAGO M ON M.ID_METODO_PAGO=P.ID_METODO_PAGO
            WHERE V.ESTADO_VENTA='CONFIRMADA' AND ${turnoIncluido}
          ), COBROS AS (SELECT ID_TURNO_CAJA,
            SUM(CASE WHEN NOMBRE_METODO='EFECTIVO' THEN MONTO_PAGADO ELSE 0 END) EFECTIVO,
            SUM(CASE WHEN NOMBRE_METODO='TARJETA' THEN MONTO_PAGADO ELSE 0 END) TARJETA,
            SUM(CASE WHEN NOMBRE_METODO='TRANSFERENCIA' THEN MONTO_PAGADO ELSE 0 END) TRANSFERENCIA
            FROM PAGOS GROUP BY ID_TURNO_CAJA), CONFIRMADAS AS (
            SELECT V.ID_TURNO_CAJA, COUNT(*) VENTAS, SUM(V.TOTAL_VENTA) INGRESOS FROM T
            JOIN VENTA V ON V.ID_TURNO_CAJA=T.ID_TURNO_CAJA
            WHERE V.ESTADO_VENTA='CONFIRMADA' AND ${turnoIncluido} GROUP BY V.ID_TURNO_CAJA
          )
          SELECT T.ID_TURNO_CAJA AS ID, C.NOMBRE_CAJA AS CAJA, T.ESTADO_TURNO AS ESTADO,
            A.NOMBRE_COMPLETO AS APERTURA_POR, B.NOMBRE_COMPLETO AS CIERRE_POR,
            ${fechaHora("T.FECHA_HORA_APERTURA")} AS APERTURA, ${fechaHora("T.FECHA_HORA_CIERRE")} AS CIERRE,
            ROUND(NVL(T.DURACION_DIAS, CAST(SYSTIMESTAMP AS DATE)-CAST(T.FECHA_HORA_APERTURA AS DATE))*1440) AS MINUTOS,
            T.INICIAL_EFECTIVO, NVL(V.VENTAS,0) AS TRANSACCIONES, NVL(V.INGRESOS,0) AS INGRESOS,
            ${["EFECTIVO", "TARJETA", "TRANSFERENCIA"].map((m) => `CASE WHEN T.ESTADO_TURNO='ABIERTO'
              THEN T.INICIAL_${m} + NVL(P.${m},0) ELSE T.CIERRE_SISTEMA_${m} END AS ESP_${m},
              T.CIERRE_REAL_${m} AS REAL_${m}`).join(",\n            ")},
            T.DESCUADRE
          FROM T JOIN CAJA_TERMINAL C ON C.ID_CAJA=T.ID_CAJA JOIN USUARIO A ON A.ID_USUARIO=T.ID_USUARIO_APERTURA
          LEFT JOIN USUARIO B ON B.ID_USUARIO=T.ID_USUARIO_CIERRE LEFT JOIN COBROS P ON P.ID_TURNO_CAJA=T.ID_TURNO_CAJA
          LEFT JOIN CONFIRMADAS V ON V.ID_TURNO_CAJA=T.ID_TURNO_CAJA
          WHERE ${turnoIncluido} ORDER BY T.FECHA_HORA_APERTURA DESC,T.ID_TURNO_CAJA DESC`
      };
    case "vendedores":
      return { tabla: `${ventasCte}, POR_USUARIO AS (
          SELECT V.ID_USUARIO, COUNT(*) AS REGISTRADAS, COUNT(CASE WHEN ${confirmadas} THEN 1 END) AS TRANSACCIONES,
            NVL(SUM(CASE WHEN ${confirmadas} THEN V.TOTAL_VENTA END),0) AS INGRESOS,
            ROUND(AVG(CASE WHEN ${confirmadas} THEN V.TOTAL_VENTA END),2) AS TICKET,
            COUNT(DISTINCT TRUNC(V.FECHA_HORA_VENTA)) AS DIAS_ACTIVOS,
            MIN(V.FECHA_HORA_VENTA) AS PRIMERA, MAX(V.FECHA_HORA_VENTA) AS ULTIMA
          FROM V WHERE ${actual} GROUP BY V.ID_USUARIO
        ), APERTURAS AS (
          SELECT ID_USUARIO_APERTURA AS ID_USUARIO, COUNT(*) AS TURNOS FROM TURNO_CAJA T
          WHERE ${rango("T.FECHA_HORA_APERTURA")} AND ${filtro("T.ID_CAJA", "caja")} GROUP BY ID_USUARIO_APERTURA
        )
        SELECT U.NOMBRE_COMPLETO AS RESPONSABLE, NVL(V.REGISTRADAS,0) AS REGISTRADAS,
          NVL(V.TRANSACCIONES,0) AS TRANSACCIONES, NVL(V.INGRESOS,0) AS INGRESOS, V.TICKET,
          NVL(A.TURNOS,0) AS TURNOS, NVL(V.DIAS_ACTIVOS,0) AS DIAS_ACTIVOS,
          ${fechaHora("V.PRIMERA")} AS PRIMERA, ${fechaHora("V.ULTIMA")} AS ULTIMA
        FROM USUARIO U JOIN ROL_USUARIO R ON R.ID_ROL=U.ID_ROL
        LEFT JOIN POR_USUARIO V ON V.ID_USUARIO=U.ID_USUARIO LEFT JOIN APERTURAS A ON A.ID_USUARIO=U.ID_USUARIO
        WHERE R.NOMBRE_ROL='VENDEDOR' AND ${filtro("U.ID_USUARIO", "vendedor")}
        ORDER BY INGRESOS DESC,U.ID_USUARIO` };
    default:
      return {};
  }
}

async function leer(c, seccion, f, exportar = false) {
  const datos = {};
  const limite = seccion === "productos" ? f.top : exportar ? maxExportacion : paginaTam;
  for (const [clave, consulta] of Object.entries(plan(seccion, f))) {
    const tabla = clave === "tabla";
    const top = seccion === "productos";
    const sql = tabla ? `${consulta} OFFSET :desplazamiento ROWS FETCH NEXT :limite ROWS ONLY` : consulta;
    const valores = { ...f, limite: limite + Number(!top), desplazamiento: exportar || top ? 0 : (f.pagina - 1) * paginaTam };
    const binds = Object.fromEntries([...new Set(Array.from(sql.matchAll(/:([a-z][a-zA-Z]*)\b/g), (m) => m[1]))]
      .map((id) => [id, valores[id]]));
    const filasQuery = seccion === "pagos" && tabla && datos.serie
      ? datos.serie.slice(valores.desplazamiento, valores.desplazamiento + valores.limite)
      : await filas(c, sql, binds);
    datos[clave] = ["indicadores", "compras", "stock", "caja"].includes(clave) ? filasQuery[0] : filasQuery;
    if (tabla) {
      datos.hayMas = filasQuery.length > limite;
      datos.tabla = filasQuery.slice(0, limite);
    }
  }
  return datos;
}

async function catalogos(c) {
  const consultas = {
    vendedor: "SELECT ID_USUARIO AS ID, NOMBRE_COMPLETO AS NOMBRE FROM USUARIO ORDER BY NOMBRE_COMPLETO, ID_USUARIO",
    caja: "SELECT ID_CAJA AS ID, NOMBRE_CAJA AS NOMBRE FROM CAJA_TERMINAL ORDER BY NOMBRE_CAJA",
    producto: "SELECT ID_PRODUCTO AS ID, NOMBRE_PRODUCTO AS NOMBRE FROM PRODUCTO ORDER BY NOMBRE_PRODUCTO, ID_PRODUCTO",
    categoria: "SELECT ID_CATEGORIA AS ID, NOMBRE_CATEGORIA AS NOMBRE FROM CATEGORIA_PRODUCTO ORDER BY NOMBRE_CATEGORIA",
    metodo: "SELECT ID_METODO_PAGO AS ID, NOMBRE_METODO AS NOMBRE FROM METODO_PAGO ORDER BY NOMBRE_METODO",
    proveedor: "SELECT ID_PROVEEDOR AS ID, RAZON_SOCIAL AS NOMBRE FROM PROVEEDOR ORDER BY RAZON_SOCIAL",
    unidad: "SELECT ID_UNIDAD AS ID, CODIGO_UNIDAD AS NOMBRE FROM UNIDAD_MEDIDA ORDER BY CODIGO_UNIDAD"
  };
  const resultado = {};
  for (const [key, sql] of Object.entries(consultas)) resultado[key] = await filas(c, sql);
  return resultado;
}

module.exports = { filtros, plan, leer, catalogos, secciones, maxExportacion };
