import { useEffect, useState } from "react";
import { Barras, Dona, Serie } from "./ReportesGraficos";
import "./Reportes.css";
import { CabeceraModulo, EtiquetaEstado, PestanasModulo } from "./Presentacion.jsx";

const api = "/api/reportes";
const dia = 86400000;
const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const breve = new Intl.NumberFormat("es-CL", { notation: "compact", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
const moneda = (valor) => clp.format(valor);
const ejeMoneda = (valor) => `$${breve.format(valor)}`;
const numero = (valor) => decimal.format(valor);
const secciones = [
  ["resumen", "Resumen"], ["ventas", "Ventas"], ["productos", "Productos"], ["pagos", "Pagos"],
  ["compras", "Compras"], ["inventario", "Inventario"], ["movimientos", "Movimientos"],
  ["caja", "Caja"], ["vendedores", "Vendedores"]
];
const nombres = {
  vendedor: "Responsable", caja: "Caja", producto: "Producto", categoria: "Categoría",
  metodo: "Método de pago", proveedor: "Proveedor", unidad: "Unidad"
};
const alcance = {
  resumen: ["vendedor", "caja", "producto", "categoria", "metodo", "proveedor", "unidad"],
  ventas: ["vendedor", "caja", "producto", "categoria", "metodo"],
  productos: ["vendedor", "caja", "producto", "categoria", "metodo", "unidad"],
  pagos: ["vendedor", "caja", "producto", "categoria", "metodo"],
  compras: ["proveedor", "producto", "categoria"],
  inventario: ["producto", "categoria", "unidad"],
  movimientos: ["vendedor", "producto", "categoria", "unidad"],
  caja: ["vendedor", "caja"],
  vendedores: ["vendedor", "caja", "producto", "categoria", "metodo"]
};
const etiquetas = {
  ID: "ID", CATEGORIA: "Categoría", METODO: "Método", PARTICIPACION: "Participación",
  ARTICULO: "Artículo", OBSERVACION: "Observación", PRECIO_MIN: "Precio histórico mín.", PRECIO_MAX: "Precio histórico máx.",
  COSTO: "Costo unitario", TICKET: "Ticket promedio", ESTADO: "Estado", DIAS_ACTIVOS: "Días con ventas registradas",
  APERTURA_POR: "Abrió", CIERRE_POR: "Cerró", DURACION: "Duración", MINUTOS: "Minutos",
  ESP_EFECTIVO: "Esperado efectivo", ESP_TARJETA: "Esperado tarjeta", ESP_TRANSFERENCIA: "Esperado transferencia",
  REAL_EFECTIVO: "Contado efectivo", REAL_TARJETA: "Declarado tarjeta", REAL_TRANSFERENCIA: "Declarado transferencia"
};
const periodos = [
  ["hoy", "Hoy"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["mes", "Este mes"],
  ["mesAnterior", "Mes anterior"], ["anio", "Este año"], ["personalizado", "Rango personalizado"]
];
const notas = {
  resumen: "Ventas y cantidades: responsable, caja, producto, categoría y método. Compras: proveedor, producto y categoría. Stock actual: producto, categoría y unidad. Caja: responsable y terminal.",
  ventas: "Los indicadores y gráficos cuentan ventas confirmadas. Los filtros por producto, categoría o método seleccionan ventas completas. El filtro de estado afecta el detalle.",
  productos: "Ingresos de las líneas confirmadas y precios históricos registrados. Nombre, categoría y unidad provienen del catálogo actual.",
  pagos: "Importes de pagos registrados en ventas confirmadas. Si filtras por método, la participación corresponde a los pagos de ese método.",
  compras: "Abastecimientos históricos de productos. Oracle no conserva compras de insumos como movimientos históricos consultables.",
  inventario: "Existencias actuales de artículos activos, fuera del filtro de fechas. Las categorías pertenecen al catálogo de productos.",
  movimientos: "Ajustes manuales registrados de productos. Los ingresos son positivos y las mermas son negativas. Los ajustes de insumos carecen de historial.",
  caja: "Turnos cerrados por fecha de cierre y turnos actualmente abiertos. El responsable puede ser quien abrió o cerró. Esperado abierto: inicial más cobros confirmados.",
  vendedores: "Actividad comercial de cuentas con rol vendedor. Los turnos cuentan aperturas y responden a la fecha, caja y responsable. Son cifras descriptivas."
};

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
function fechas(preajuste) {
  const partes = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const fecha = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  const hoy = `${fecha.year}-${fecha.month}-${fecha.day}`;
  const mes = Date.UTC(Number(fecha.year), Number(fecha.month) - 1, 1);
  if (preajuste === "mesAnterior") return { desde: iso(Date.UTC(Number(fecha.year), Number(fecha.month) - 2, 1)), hasta: iso(mes - dia) };
  if (preajuste === "mes") return { desde: iso(mes), hasta: hoy };
  if (preajuste === "anio") return { desde: `${fecha.year}-01-01`, hasta: hoy };
  const dias = Number(preajuste) || 1;
  return { desde: iso(Date.parse(hoy) - (dias - 1) * dia), hasta: hoy };
}

function fechasAgrupadas(desde, hasta, agrupacion) {
  const fecha = new Date(desde);
  if (agrupacion === "semana") fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7);
  if (agrupacion === "mes" || agrupacion === "anio") fecha.setUTCDate(1);
  if (agrupacion === "anio") fecha.setUTCMonth(0);
  const salida = [];
  while (fecha <= new Date(hasta) && salida.length <= 366) {
    salida.push(iso(fecha));
    if (agrupacion === "mes") fecha.setUTCMonth(fecha.getUTCMonth() + 1);
    else if (agrupacion === "anio") fecha.setUTCFullYear(fecha.getUTCFullYear() + 1);
    else fecha.setUTCDate(fecha.getUTCDate() + (agrupacion === "semana" ? 7 : 1));
  }
  return salida;
}

function diaVisible(texto, agrupacion = "dia") {
  const [anio, mes, dia] = texto.slice(0, 10).split("-");
  if (agrupacion === "anio") return anio;
  if (agrupacion === "mes") return `${mes}/${anio}`;
  return `${dia}/${mes}`;
}

function etiqueta(clave) {
  return etiquetas[clave] ?? clave.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function celda(clave, valor) {
  if (valor == null) return "—";
  if (typeof valor !== "number" || clave === "ID") return valor;
  if (/^(INGRESOS|GASTOS|TICKET|IMPORTE|COSTO|PRECIO_|DESCUADRE|REAL_|ESP_|INICIAL_)/.test(clave)) return moneda(valor);
  if (clave === "PARTICIPACION") return `${numero(valor)}%`;
  return numero(valor);
}

function Indicadores({ items }) {
  return <div className="reportes-indicadores">{items.map(([nombre, valor, previo, money]) => {
    const variacion = previo != null && previo !== 0 && valor != null ? (valor - previo) * 100 / Math.abs(previo) : null;
    return <article key={nombre}>
      <span>{nombre}</span>
      <strong>{valor == null ? "—" : money ? moneda(valor) : numero(valor)}</strong>
      {previo != null && <small>Anterior {money ? moneda(previo) : numero(previo)}
        {variacion !== null && ` · ${variacion > 0 ? "+" : ""}${variacion.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`}</small>}
    </article>;
  })}</div>;
}

function Tabla({ registros, titulo, accion, vacio = "Sin registros para los filtros seleccionados." }) {
  if (!registros?.length) return <p className="reportes-vacio">{vacio}</p>;
  const columnas = Object.keys(registros[0]);
  return <div className="tabla-contenedor reportes-tabla" tabIndex={0} role="region" aria-label={titulo}><table aria-label={titulo}>
    <thead><tr>{columnas.map((c) => <th key={c} scope="col">{etiqueta(c)}</th>)}{accion && <th scope="col">Acción</th>}</tr></thead>
    <tbody>{registros.map((r, i) => <tr key={i}>{columnas.map((c) => <td key={c} className={typeof r[c] === "number" ? "modulo-numero" : undefined}>
      {c === "ESTADO" ? <EtiquetaEstado tono={["Crítico", "Agotado", "BORRADOR"].includes(r[c]) ? "alerta" : "neutro"}>{r[c]}</EtiquetaEstado> : celda(c, r[c])}
    </td>)}{accion && <td>{accion(r)}</td>}</tr>)}</tbody>
  </table></div>;
}

function Cantidades({ filas, titulo }) {
  if (!filas?.length) return null;
  return <div className="reportes-cantidades"><strong>{titulo}</strong>
    {filas.map(({ UNIDAD, CANTIDAD }) => <span key={UNIDAD}>{numero(CANTIDAD)} {UNIDAD}</span>)}</div>;
}

const ventasKpi = (d) => [
  ["Ingresos confirmados", d.INGRESOS, d.INGRESOS_ANTERIOR, true],
  ["Transacciones confirmadas", d.TRANSACCIONES, d.TRANSACCIONES_ANTERIOR],
  ["Ticket promedio", d.TICKET, d.TICKET_ANTERIOR, true]
];
const comprasKpi = (d) => [["Gastos de abastecimiento", d.GASTOS, d.GASTOS_ANTERIOR, true], ["Abastecimientos", d.ABASTECIMIENTOS]];
const stockKpi = (d) => [
  ["Productos activos", d.PRODUCTOS], ["Insumos activos", d.INSUMOS], ["Productos críticos", d.PRODUCTOS_CRITICOS],
  ["Insumos críticos", d.INSUMOS_CRITICOS], ["Artículos agotados", d.AGOTADOS]
];
const cajaKpi = (d) => [["Turnos abiertos ahora", d.ABIERTOS], ["Turnos cerrados", d.CERRADOS, d.CERRADOS_ANTERIOR],
  ["Turnos con descuadre", d.CON_DESCUADRE], ["Descuadre neto de caja", d.DESCUADRE, d.DESCUADRE_ANTERIOR, true]];

function Tendencias({ datos, rango, agrupacion, campo, nombre, ventas = false, comparar = false }) {
  if (!datos.length) return <p className="reportes-vacio">Sin movimientos para graficar.</p>;
  const actual = fechasAgrupadas(rango.desde, rango.hasta, agrupacion);
  const finalAnterior = Date.parse(rango.desde) - dia;
  const anterior = fechasAgrupadas(iso(finalAnterior - (Date.parse(rango.hasta) - Date.parse(rango.desde))), iso(finalAnterior), agrupacion);
  const porFecha = new Map(datos.map((r) => [`${r.PERIODO ?? "Actual"}:${r.FECHA}`, r[campo]]));
  const series = [{ nombre: ventas ? "Período actual" : nombre, valores: actual.map((d) => porFecha.get(`Actual:${d}`) ?? 0) }];
  const etiquetas = actual.map((fecha) => diaVisible(fecha, agrupacion));
  if (comparar && datos.some((r) => r.PERIODO === "Anterior")) {
    series.push({ nombre: "Período anterior", valores: anterior.map((d) => porFecha.get(`Anterior:${d}`) ?? 0) });
    etiquetas.splice(0, etiquetas.length, ...Array.from({ length: Math.max(actual.length, anterior.length) }, (_, i) =>
      [actual[i], anterior[i]].map((d) => d ? diaVisible(d, agrupacion) : "—").join(" / ")));
  }
  return <div className={ventas ? "reportes-graficos-dobles" : ""}>
    <Serie series={series} etiquetas={etiquetas} formato={ejeMoneda} tooltip={moneda} nombre={nombre} />
    {ventas && <Serie series={series} etiquetas={etiquetas} formato={ejeMoneda} tooltip={moneda} nombre={nombre} tipo="barra" />}
  </div>;
}

function EvolucionPagos({ datos, rango, agrupacion }) {
  if (!datos.serie.length) return null;
  const fechas = fechasAgrupadas(rango.desde, rango.hasta, agrupacion);
  const montos = new Map(datos.serie.map((p) => [`${p.METODO}:${p.FECHA}`, p.IMPORTE]));
  const series = datos.metodos.map((m) => ({
    nombre: m.METODO, valores: fechas.map((fecha) => montos.get(`${m.METODO}:${fecha}`) ?? 0)
  }));
  return <Serie series={series} etiquetas={fechas.map((d) => diaVisible(d, agrupacion))}
    formato={ejeMoneda} tooltip={moneda} nombre="Evolución por método de pago" />;
}

async function consultar(ruta, signal) {
  const respuesta = await fetch(api + ruta, { signal });
  if (!respuesta.ok) {
    const datos = await respuesta.json();
    throw new Error(datos.mensaje || "No se pudo consultar el reporte");
  }
  return respuesta;
}

export default function Reportes({ irAInventario, irACompras }) {
  const [seccion, setSeccion] = useState("resumen");
  const [preajuste, setPreajuste] = useState("30");
  const [rango, setRango] = useState(() => fechas("30"));
  const [filtros, setFiltros] = useState({});
  const [agrupacion, setAgrupacion] = useState("dia");
  const [estado, setEstado] = useState("TODOS");
  const [top, setTop] = useState("10");
  const [orden, setOrden] = useState("ingreso");
  const [periodo, setPeriodo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [comparar, setComparar] = useState(true);
  const [respuesta, setRespuesta] = useState(null);
  const [catalogo, setCatalogo] = useState({});
  const [errorCatalogo, setErrorCatalogo] = useState("");
  const [errorExportar, setErrorExportar] = useState("");
  const [exportando, setExportando] = useState(false);
  const [revision, setRevision] = useState(0);
  const consultaValida = rango.desde && rango.hasta && rango.desde <= rango.hasta
    && Date.parse(rango.hasta) - Date.parse(rango.desde) < 366 * dia
    && !(seccion === "productos" && orden === "cantidad" && !filtros.unidad);
  const params = new URLSearchParams({ ...rango, agrupacion, estado, top, orden, pagina });
  for (const clave of alcance[seccion]) if (filtros[clave]) params.set(clave, filtros[clave]);
  if (seccion === "ventas" && periodo) params.set("periodo", periodo);
  const ruta = consultaValida ? `/${seccion}?${params}` : null;
  const contenido = respuesta?.ruta === ruta && respuesta.revision === revision ? respuesta : null;
  const datos = contenido?.datos;

  useEffect(() => {
    const c = new AbortController();
    consultar("/catalogos", c.signal).then((r) => r.json()).then((d) => {
      if (!c.signal.aborted) { setCatalogo(d); setErrorCatalogo(""); }
    }).catch((e) => { if (!c.signal.aborted) setErrorCatalogo(e.message); });
    return () => c.abort();
  }, [revision]);

  useEffect(() => {
    if (!ruta) return;
    const c = new AbortController();
    consultar(ruta, c.signal).then((r) => r.json()).then((d) => {
      if (!c.signal.aborted) setRespuesta({ ruta, revision, datos: d });
    }).catch((e) => { if (!c.signal.aborted) setRespuesta({ ruta, revision, error: e.message }); });
    return () => c.abort();
  }, [ruta, revision]);

  function reiniciarDetalle() {
    setPagina(1);
    setPeriodo("");
    setErrorExportar("");
  }

  async function exportar(formato) {
    setExportando(true);
    setErrorExportar("");
    try {
      const r = await consultar(`/${seccion}/${formato}?${params}`);
      const url = URL.createObjectURL(await r.blob());
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `SABOTINO_${seccion}_${rango.desde}_${rango.hasta}.${formato}`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErrorExportar(e.message);
    } finally {
      setExportando(false);
    }
  }

  const mostrarAgrupacion = ["ventas", "pagos", "compras", "caja"].includes(seccion);
  const titulo = secciones.find(([id]) => id === seccion)[1];
  return <div className="reportes modulo">
    <CabeceraModulo modulo="reportes" titulo="Reportes y estadísticas" descripcion="Consulta el desempeño comercial y operativo de SABOTINO.">
      <button className="secundario" type="button" onClick={() => setRevision((n) => n + 1)}>Actualizar</button>
    </CabeceraModulo>
    <PestanasModulo etiqueta="Secciones de reportes" panel="reportes-resultados" opciones={secciones} activa={seccion}
      seleccionar={(id) => { setSeccion(id); reiniciarDetalle(); }} />
    <section className="reportes-panel" aria-label="Filtros del reporte">
      <h2>Filtros del reporte</h2>
      <div className="reportes-filtros">
        <label>Período<select value={preajuste} onChange={(e) => {
          setPreajuste(e.target.value);
          if (e.target.value !== "personalizado") setRango(fechas(e.target.value));
          reiniciarDetalle();
        }}>{periodos.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        {[["desde", "Desde"], ["hasta", "Hasta"]].map(([clave, label]) => <label key={clave}>{label}
          <input type="date" value={rango[clave]} onChange={(e) => {
            setRango({ ...rango, [clave]: e.target.value }); setPreajuste("personalizado"); reiniciarDetalle();
          }} />
        </label>)}
        {mostrarAgrupacion && <label>Agrupar por<select value={agrupacion} onChange={(e) => { setAgrupacion(e.target.value); reiniciarDetalle(); }}>
          <option value="dia">Día</option><option value="semana">Semana ISO</option><option value="mes">Mes</option><option value="anio">Año</option>
        </select></label>}
        {alcance[seccion].map((clave) => <label key={clave}>{nombres[clave]}
          <select value={filtros[clave] ?? ""} onChange={(e) => { setFiltros({ ...filtros, [clave]: e.target.value }); reiniciarDetalle(); }}>
            <option value="">Todos</option>
            {catalogo[clave]?.map((item) => <option key={item.ID} value={item.ID}>{item.NOMBRE}</option>)}
          </select></label>)}
      </div>
      {errorCatalogo && <p className="error" role="alert">{errorCatalogo}</p>}
      <p className="reportes-alcance">{notas[seccion]} Fechas en horario de Chile.</p>
    </section>
    <section id="reportes-resultados" className="reportes-panel" aria-label={titulo}>
      <div className="reportes-titulo"><h2>{titulo}</h2>
        <div className="reportes-exportar">
          {seccion !== "resumen" && <button className="secundario" type="button" disabled={!datos || exportando} onClick={() => exportar("csv")}>Descargar CSV</button>}
          <button type="button" disabled={!datos || exportando} onClick={() => exportar("pdf")}>Descargar PDF</button>
        </div>
      </div>
      {errorExportar && <p className="error" role="alert">{errorExportar}</p>}
      {seccion === "productos" && <div className="reportes-filtros">
        <label>Tamaño del ranking<select value={top} onChange={(e) => setTop(e.target.value)}>
          <option value="5">Top 5</option><option value="10">Top 10</option><option value="20">Top 20</option>
        </select></label>
        <label>Ordenar por<select value={orden} onChange={(e) => setOrden(e.target.value)}>
          <option value="ingreso">Ingresos</option><option value="cantidad">Cantidad (una unidad)</option>
        </select></label>
      </div>}
      {seccion === "ventas" && <div className="reportes-filtros">
        <label>Estado del detalle<select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
          <option value="TODOS">Todos</option><option>CONFIRMADA</option><option>BORRADOR</option><option>ANULADA</option>
        </select></label>
        <label>Detalle por período<select value={periodo} onChange={(e) => { setPeriodo(e.target.value); setPagina(1); }}>
          <option value="">Todo el rango</option>
          {rango.desde && rango.hasta && fechasAgrupadas(rango.desde, rango.hasta, agrupacion).map((fecha) =>
            <option key={fecha} value={fecha}>{fecha}</option>)}
        </select></label>
        <label className="reportes-checkbox"><input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />Comparar período anterior</label>
      </div>}
      {!consultaValida && <p className="reportes-vacio">{seccion === "productos" && orden === "cantidad" && !filtros.unidad
        ? "Selecciona una unidad para comparar cantidades." : "Selecciona un rango válido de hasta 366 días."}</p>}
      {ruta && !contenido && <p role="status" className="reportes-vacio">Consultando Oracle…</p>}
      {contenido?.error && <p className="error" role="alert">{contenido.error}</p>}
      {datos && <>
        {seccion === "resumen" && <>
          <Indicadores items={[...ventasKpi(datos.indicadores), ...comprasKpi(datos.compras),
            ["Productos críticos", datos.stock.PRODUCTOS_CRITICOS], ["Insumos críticos", datos.stock.INSUMOS_CRITICOS],
            ...cajaKpi(datos.caja)]} />
          <Cantidades filas={datos.cantidades} titulo="Cantidad vendida por unidad" />
        </>}
        {seccion === "ventas" && <>
          <Indicadores items={ventasKpi(datos.indicadores)} />
          <Cantidades filas={datos.cantidades} titulo="Cantidad vendida por unidad" />
          <Tendencias datos={datos.serie} campo="INGRESOS" rango={rango} agrupacion={agrupacion} nombre="Evolución de ventas" ventas comparar={comparar} />
          {datos.indicadores.TRANSACCIONES > 0 && <p className="reportes-alcance">
            {datos.actividad.flatMap((d) => [d.MAYOR === 1 && `Mayor actividad: ${d.FECHA} (${numero(d.TRANSACCIONES)})`,
              d.MENOR === 1 && `Menor actividad: ${d.FECHA} (${numero(d.TRANSACCIONES)})`].filter(Boolean)).join(" · ")}
          </p>}
          {datos.serie.length > 0 && <details><summary>Datos de los gráficos</summary><Tabla registros={datos.serie} titulo="Evolución de ventas" /></details>}
        </>}
        {seccion === "productos" && <Barras filas={datos.tabla} etiqueta="PRODUCTO" valor={orden === "ingreso" ? "INGRESOS" : "CANTIDAD"}
          formato={orden === "ingreso" ? moneda : numero} titulo={orden === "ingreso" ? "Ranking por ingresos" : "Ranking por cantidad"} />}
        {seccion === "pagos" && <>
          <Dona metodos={datos.metodos} total={datos.metodos[0]?.TOTAL_PAGOS} moneda={moneda} />
          {datos.metodos.length > 0 && <Tabla registros={datos.metodos.map((m) => ({
            METODO: m.METODO, PAGOS: m.PAGOS, IMPORTE: m.IMPORTE, PARTICIPACION: m.PARTICIPACION
          }))} titulo="Resumen de métodos de pago" />}
          <EvolucionPagos datos={datos} rango={rango} agrupacion={agrupacion} />
        </>}
        {seccion === "compras" && <>
          <Indicadores items={comprasKpi(datos.indicadores)} />
          <Cantidades filas={datos.cantidades} titulo="Cantidad adquirida por unidad" />
          <Tendencias datos={datos.serie} campo="GASTOS" rango={rango} agrupacion={agrupacion} nombre="Evolución de gastos" />
          <div className="reportes-graficos-dobles"><Barras filas={datos.proveedores} etiqueta="PROVEEDOR" valor="GASTOS" formato={moneda} titulo="Proveedores por importe" />
            <Barras filas={datos.productos} etiqueta="PRODUCTO" valor="GASTOS" formato={moneda} titulo="Productos por costo de abastecimiento" /></div>
        </>}
        {seccion === "inventario" && <Indicadores items={stockKpi(datos.indicadores)} />}
        {seccion === "caja" && <>
          <Indicadores items={cajaKpi(datos.indicadores)} />
          <Tendencias datos={datos.serie} campo="DESCUADRE" rango={rango} agrupacion={agrupacion} nombre="Descuadres por fecha de cierre" />
        </>}
        {datos.tabla && <Tabla registros={datos.tabla} titulo={titulo} accion={seccion === "inventario" ? (fila) =>
          fila.TIPO === "Producto" && fila.ESTADO !== "Normal"
            ? <button type="button" onClick={() => irACompras(fila.ID)}>Abastecer</button>
            : <button type="button" onClick={() => irAInventario(fila.ARTICULO)}>Ver en Inventario</button> : null} />}
        {(pagina > 1 || datos.hayMas) && <div className="reportes-paginacion">
          <button type="button" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina}</span>
          <button type="button" disabled={!datos.hayMas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>}
      </>}
    </section>
  </div>;
}
