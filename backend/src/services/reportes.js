const { consultarProcedimiento } = require("../config/procedimientos");

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

const consultas = {
  resumen: {
    indicadores: ["SAB_API_REP_RESUMEN_INDICADORES", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde"],
    compras: ["SAB_API_REP_RESUMEN_COMPRAS", "anterior", "hasta", "proveedor", "producto", "categoria", "desde"],
    stock: ["SAB_API_REP_RESUMEN_STOCK", "producto", "categoria", "unidad"],
    caja: ["SAB_API_REP_RESUMEN_CAJA", "caja", "vendedor", "desde", "hasta", "anterior"],
    cantidades: ["SAB_API_REP_RESUMEN_CANTIDADES", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde"]
  },
  ventas: {
    indicadores: ["SAB_API_REP_RESUMEN_INDICADORES", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde"],
    cantidades: ["SAB_API_REP_RESUMEN_CANTIDADES", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde"],
    serie: ["SAB_API_REP_VENTAS_SERIE", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde", "agrupacion"],
    actividad: ["SAB_API_REP_VENTAS_ACTIVIDAD", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde"],
    tabla: ["SAB_API_REP_VENTAS_TABLA", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde", "estado", "periodo", "agrupacion", "desplazamiento", "limite"]
  },
  productos: {
    tabla: ["SAB_API_REP_PRODUCTOS_TABLA", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde", "unidad", "orden", "desplazamiento", "limite"]
  },
  pagos: {
    metodos: ["SAB_API_REP_PAGOS_METODOS", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde"],
    serie: ["SAB_API_REP_PAGOS_SERIE", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "agrupacion", "desde"]
  },
  compras: {
    indicadores: ["SAB_API_REP_RESUMEN_COMPRAS", "anterior", "hasta", "proveedor", "producto", "categoria", "desde"],
    cantidades: ["SAB_API_REP_COMPRAS_CANTIDADES", "anterior", "hasta", "proveedor", "producto", "categoria", "desde"],
    serie: ["SAB_API_REP_COMPRAS_SERIE", "anterior", "hasta", "proveedor", "producto", "categoria", "agrupacion", "desde"],
    proveedores: ["SAB_API_REP_COMPRAS_PROVEEDORES", "anterior", "hasta", "proveedor", "producto", "categoria", "desde"],
    productos: ["SAB_API_REP_COMPRAS_PRODUCTOS", "anterior", "hasta", "proveedor", "producto", "categoria", "desde"],
    tabla: ["SAB_API_REP_COMPRAS_TABLA", "anterior", "hasta", "proveedor", "producto", "categoria", "desde", "desplazamiento", "limite"]
  },
  inventario: {
    indicadores: ["SAB_API_REP_RESUMEN_STOCK", "producto", "categoria", "unidad"],
    tabla: ["SAB_API_REP_INVENTARIO_TABLA", "producto", "categoria", "unidad", "desplazamiento", "limite"]
  },
  movimientos: {
    tabla: ["SAB_API_REP_MOVIMIENTOS_TABLA", "desde", "hasta", "producto", "categoria", "unidad", "vendedor", "desplazamiento", "limite"]
  },
  caja: {
    indicadores: ["SAB_API_REP_RESUMEN_CAJA", "caja", "vendedor", "desde", "hasta", "anterior"],
    serie: ["SAB_API_REP_CAJA_SERIE", "caja", "vendedor", "agrupacion", "desde", "hasta"],
    tabla: ["SAB_API_REP_CAJA_TABLA", "caja", "vendedor", "desde", "hasta", "desplazamiento", "limite"]
  },
  vendedores: {
    tabla: ["SAB_API_REP_VENDEDORES_TABLA", "anterior", "hasta", "caja", "vendedor", "producto", "categoria", "metodo", "desde", "desplazamiento", "limite"]
  }
};

const consultasCatalogos = {
  vendedor: ["SAB_API_REP_FILTRO_VENDEDOR"],
  caja: ["SAB_API_REP_FILTRO_CAJA"],
  producto: ["SAB_API_REP_FILTRO_PRODUCTO"],
  categoria: ["SAB_API_REP_FILTRO_CATEGORIA"],
  metodo: ["SAB_API_REP_FILTRO_METODO"],
  proveedor: ["SAB_API_REP_FILTRO_PROVEEDOR"],
  unidad: ["SAB_API_REP_FILTRO_UNIDAD"]
};

async function leer(c, actorId, seccion, f, exportar = false) {
  const datos = {};
  const top = seccion === "productos";
  const limite = top ? f.top : exportar ? maxExportacion : paginaTam;
  const valores = { ...f, limite: limite + Number(!top), desplazamiento: exportar || top ? 0 : (f.pagina - 1) * paginaTam };
  for (const [clave, [nombre, ...parametros]] of Object.entries(consultas[seccion])) {
    const binds = Object.fromEntries(parametros.map((id) => [id, valores[id]]));
    const filas = await consultarProcedimiento(c, nombre, { actorId, ...binds });
    if (clave === "tabla") {
      datos.hayMas = filas.length > limite;
      datos.tabla = filas.slice(0, limite);
    } else {
      datos[clave] = ["indicadores", "compras", "stock", "caja"].includes(clave) ? filas[0] : filas;
    }
  }
  if (seccion === "pagos") {
    const { desplazamiento } = valores;
    datos.tabla = datos.serie.slice(desplazamiento, desplazamiento + limite);
    datos.hayMas = datos.serie.length > desplazamiento + limite;
  }
  return datos;
}

async function catalogos(c, actorId) {
  const resultado = {};
  for (const [clave, [nombre]] of Object.entries(consultasCatalogos)) {
    resultado[clave] = await consultarProcedimiento(c, nombre, { actorId });
  }
  return resultado;
}

module.exports = { filtros, leer, catalogos, secciones, maxExportacion };
