import { useEffect, useRef, useState } from "react";
import "./Ventas.css";
import Comprobante from "./Comprobante.jsx";
import CatalogoVenta from "./CatalogoVenta.jsx";
import { Icono } from "./Navegacion.jsx";
import { PestanasModulo } from "./Presentacion.jsx";

const vistasVentas = [["nueva", "Nueva venta"], ["historial", "Historial"]];

const iconos = {
  venta: "M4 5h2l2 10h10l2-7H7 M9 19h.01 M17 19h.01",
  historial: "M12 7v5l3 2 M4 12a8 8 0 1 0 2-5.3L4 9 M4 4v5h5",
  caja: "M4 18h16v3H4z M5 18l2-9h10l2 9 M9 9V5h6v4 M8 14h8",
  recargar: "M20 10a8 8 0 0 0-14-4l-2 2 M4 3v5h5 M4 14a8 8 0 0 0 14 4l2-2 M20 21v-5h-5",
  pago: "M4 6h16v12H4z M4 10h16 M7 15h4"
};

function EstadoVacio({ icono, titulo, children }) {
  return <div className="pos-vacio">
    <span className="ventas-icono"><Icono trazado={iconos[icono]} /></span>
    <strong>{titulo}</strong>
    <p>{children}</p>
  </div>;
}

const api = "/api/ventas";
const moneda = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidad = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
const importe = (valor) => `$ ${moneda.format(valor)}`;
const maximo = 99999999999999;
const codificador = new TextEncoder();

function unidades(texto, decimales, limite) {
  if (!/^\d+(?:\.\d+)?$/.test(texto)) return NaN;
  const [entero, fraccion = ""] = texto.split(".");
  if (fraccion.length > decimales) return NaN;
  const valor = Number(entero + fraccion.padEnd(decimales, "0"));
  return valor <= limite ? valor : NaN;
}

async function solicitar(ruta, opciones) {
  const respuesta = await fetch(`${api}${ruta}`, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw Object.assign(new Error(datos.mensaje || "No se pudo completar la operación"), datos);
  return datos;
}

function enviar(ruta, datos) {
  return solicitar(ruta, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos)
  });
}

function useConsulta(ruta, revision) {
  const [resultado, setResultado] = useState(null);
  useEffect(() => {
    if (ruta === null) return;
    const controlador = new AbortController();
    solicitar(ruta, { signal: controlador.signal }).then(
      (datos) => {
        if (!controlador.signal.aborted) setResultado({ ruta, revision, datos });
      },
      (error) => {
        if (!controlador.signal.aborted) setResultado({ ruta, revision, error: error.message });
      }
    );
    return () => controlador.abort();
  }, [ruta, revision]);
  return resultado?.ruta === ruta && resultado.revision === revision ? resultado : null;
}

function HistorialVentas({ revision, ocupado, anular, verComprobante }) {
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("");
  const [pagina, setPagina] = useState(1);
  const [ventaId, setVentaId] = useState(null);
  const parametros = new URLSearchParams({ pagina, estado, buscar });
  const historial = useConsulta(`?${parametros}`, revision);
  const detalle = useConsulta(ventaId === null ? null : `/${ventaId}`, revision);
  const datos = detalle?.datos;
  return (
    <section className="panel ventas-historial" aria-labelledby="ventas-historial">
      <h2 id="ventas-historial">Historial de ventas</h2>
      <div className="campos-producto ventas-filtros-historial">
        <label>Buscar por ID o responsable
          <input type="search" placeholder="Ej. 125 o Ana" maxLength={100} value={buscar} onChange={(e) => { setBuscar(e.target.value); setPagina(1); }} />
        </label>
        <label>Estado
          <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
            <option value="">Todos</option><option>BORRADOR</option><option>CONFIRMADA</option><option>ANULADA</option>
          </select>
        </label>
      </div>
      {!historial && <p className="ventas-estado" role="status">Consultando ventas…</p>}
      {historial?.error && <p className="error" role="alert">{historial.error}</p>}
      {historial?.datos?.ventas.length === 0 && (
        <EstadoVacio icono="historial" titulo="No hay ventas para mostrar">
          {buscar || estado ? "Prueba con otra búsqueda o estado." : "Las ventas registradas aparecerán aquí."}
        </EstadoVacio>
      )}
      {historial?.datos && historial.datos.ventas.length > 0 && (
        <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Historial de ventas">
          <table aria-label="Historial de ventas">
            <thead><tr><th>ID</th><th>Fecha</th><th>Responsable</th><th>Total</th><th>Estado</th><th>Detalle</th></tr></thead>
            <tbody>{historial.datos.ventas.map((venta) => (
              <tr key={venta.ID_VENTA}>
                <td><strong>#{venta.ID_VENTA}</strong></td><td>{venta.FECHA}</td><td>{venta.RESPONSABLE}</td>
                <td className="ventas-importe-tabla">{importe(venta.TOTAL_VENTA)}</td>
                <td><span className="ventas-estado-venta" data-estado={venta.ESTADO_VENTA}>{venta.ESTADO_VENTA}</span></td>
                <td><button className="secundario" type="button" aria-label={`Ver detalle de la venta #${venta.ID_VENTA}`} onClick={() => setVentaId(venta.ID_VENTA)}>Ver detalle</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(pagina > 1 || historial?.datos?.hayMas) && (
        <div className="acciones-formulario">
          <button type="button" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina}</span>
          <button type="button" disabled={!historial?.datos?.hayMas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      )}
      {ventaId !== null && (
        <div className="formulario-producto">
          <h3>Venta #{ventaId}</h3>
          {!detalle && <p role="status">Consultando detalle…</p>}
          {detalle?.error && <p className="error" role="alert">{detalle.error}</p>}
          {datos && <>
            <p>{datos.venta.ESTADO_VENTA} · Turno #{datos.venta.ID_TURNO_CAJA} · Total {importe(datos.venta.TOTAL_VENTA)}</p>
            <h4>Productos</h4>
            {datos.detalles.length ? <ul>{datos.detalles.map((linea) => (
              <li key={linea.ID_DETALLE_VENTA}>{linea.NOMBRE_PRODUCTO} · {cantidad.format(linea.CANTIDAD)} {linea.CODIGO_UNIDAD} × {importe(linea.PRECIO_UNITARIO_HISTORICO)} · {importe(linea.SUBTOTAL_LINEA)}</li>
            ))}</ul> : <p>Sin líneas.</p>}
            <h4>Pagos</h4>
            {datos.pagos.length ? <ul>{datos.pagos.map((pago) => (
              <li key={pago.ID_PAGO_VENTA}>{pago.NOMBRE_METODO} · {importe(pago.MONTO_PAGADO)}{pago.CODIGO_COMPROBANTE && ` · Comprobante ${pago.CODIGO_COMPROBANTE}`}</li>
            ))}</ul> : <p>Sin pagos.</p>}
            {datos.puedeAnular && <button type="button" disabled={ocupado} onClick={() => anular(ventaId)}>Anular borrador</button>}
            {datos.venta.ESTADO_VENTA === "CONFIRMADA" &&
              <button type="button" onClick={() => verComprobante(ventaId)}>Ver comprobante</button>}
          </>}
          <button type="button" onClick={() => setVentaId(null)}>Cerrar detalle</button>
        </div>
      )}
    </section>
  );
}

export default function Ventas({ usuario, onVentaRegistrada, onIrACaja }) {
  const [vista, setVista] = useState("nueva");
  const clavePendiente = `sabotino.venta-pendiente.${usuario.id}`;
  const [pendiente, setPendiente] = useState(() => sessionStorage.getItem(clavePendiente) || "");
  const [revision, setRevision] = useState(0);
  const [lineas, setLineas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [turno, setTurno] = useState("");
  const [confirmacion, setConfirmacion] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [ventaRegistrada, setVentaRegistrada] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [error, setError] = useState("");
  const enCurso = useRef(false);
  const proximoPago = useRef(0);
  const catalogo = useConsulta("/catalogos", revision);
  const { productos = [], metodos = [], turnos = [] } = catalogo?.datos ?? {};
  const turnoId = turnos.some((t) => t.ID_TURNO_CAJA === Number(turno))
    ? Number(turno) : turnos.length === 1 ? turnos[0].ID_TURNO_CAJA : "";
  const detalle = lineas.map((linea) => {
    const producto = productos.find((p) => p.ID_PRODUCTO === linea.productoId);
    const milesimas = unidades(linea.cantidad, 3, 999999999999);
    const subtotal = producto && Number.isFinite(milesimas) ?
      (BigInt(milesimas) * BigInt(Math.round(producto.PRECIO_VENTA_ACTUAL * 100)) + 500n) / 1000n : 0n;
    return { ...linea, producto, milesimas, subtotal };
  });
  const total = detalle.reduce((suma, linea) => suma + linea.subtotal, 0n);
  const pagado = pagos.reduce((suma, pago) => suma + BigInt(unidades(pago.monto, 2, maximo) || 0), 0n);
  const bloqueado = ocupado || Boolean(confirmacion);

  useEffect(() => {
    function alVolver() {
      if (!bloqueado && document.visibilityState === "visible") setRevision((anterior) => anterior + 1);
    }
    window.addEventListener("focus", alVolver);
    return () => window.removeEventListener("focus", alVolver);
  }, [bloqueado]);

  function actualizar() {
    setRevision((n) => n + 1);
  }

  function prepararVenta(e) {
    e.preventDefault();
    setMensaje("");
    if (pendiente) return;
    if (!turnoId || !detalle.length) return setError("Selecciona un turno abierto y agrega productos.");
    for (const linea of detalle) {
      if (!linea.producto || !(linea.milesimas > 0) ||
          (linea.producto.PERMITE_DECIMALES === "N" && linea.milesimas % 1000 !== 0)) {
        return setError("Revisa la cantidad y la unidad de cada producto.");
      }
      if (linea.milesimas / 1000 > linea.producto.STOCK_ACTUAL) return setError(`Stock insuficiente para ${linea.producto.NOMBRE_PRODUCTO}.`);
    }
    for (const pago of pagos) {
      const metodo = metodos.find((m) => m.ID_METODO_PAGO === Number(pago.metodoId));
      if (!metodo || !(unidades(pago.monto, 2, maximo) > 0) ||
          (metodo.REQUIERE_COMPROBANTE === "S" && !pago.comprobante.trim()) ||
          codificador.encode(pago.comprobante.trim()).length > 50) {
        return setError("Revisa los métodos, importes y comprobantes de los pagos.");
      }
    }
    if (total > BigInt(maximo) || pagado !== total) return setError("La suma de los pagos debe coincidir con el total.");
    setError("");
    setConfirmacion({
      turnoId, totalEsperado: Number(total) / 100,
      lineas: detalle.map(({ productoId, milesimas }) => ({ productoId, cantidad: milesimas / 1000 })),
      pagos: pagos.map((p) => ({ metodoId: Number(p.metodoId), monto: unidades(p.monto, 2, maximo) / 100, comprobante: p.comprobante.trim() }))
    });
  }

  async function operar(ruta, datos, alConfirmar, esVenta = false) {
    if (enCurso.current || (esVenta && pendiente)) return;
    enCurso.current = true;
    setOcupado(true);
    setError("");
    setMensaje("");
    if (esVenta) sessionStorage.setItem(clavePendiente, "pendiente");
    try {
      const resultado = await enviar(ruta, datos);
      if (esVenta) sessionStorage.removeItem(clavePendiente);
      alConfirmar(resultado);
    } catch (fallo) {
      if (fallo.estado === "ERROR") {
        if (esVenta) sessionStorage.removeItem(clavePendiente);
        setError(fallo.anulada ? `${fallo.message}. Borrador #${fallo.ventaId} anulado.` : fallo.message);
      } else if (esVenta) {
        const referencia = fallo.ventaId ? String(fallo.ventaId) : "pendiente";
        sessionStorage.setItem(clavePendiente, referencia);
        setPendiente(referencia);
        setLineas([]);
        setPagos([]);
      } else {
        setError("Resultado incierto. Revisa el estado del borrador antes de repetir la anulación.");
      }
    } finally {
      enCurso.current = false;
      setOcupado(false);
      setConfirmacion(null);
      actualizar();
    }
  }

  function registrar() {
    if (!confirmacion) return;
    void operar("", confirmacion, ({ ventaId, total: registrado }) => {
      setMensaje(`Venta #${ventaId} confirmada por ${importe(registrado)}.`);
      setVentaRegistrada(ventaId);
      setLineas([]);
      setPagos([]);
      void onVentaRegistrada();
    }, true);
  }

  function anular(ventaId) {
    if (!window.confirm(`¿Anular el borrador #${ventaId}?`)) return;
    void operar(`/${ventaId}/anulacion`, {}, () => setMensaje(`Borrador #${ventaId} anulado.`));
  }

  return (
    <div className="ventas modulo">
      <header className="encabezado ventas-encabezado">
        <div><h1>Ventas</h1><p>Responsable: {usuario.nombre}</p></div>
        <button className="secundario ventas-boton-icono" type="button" disabled={bloqueado} onClick={actualizar}>
          <Icono trazado={iconos.recargar} /> Actualizar
        </button>
      </header>
      <PestanasModulo etiqueta="Vistas de Ventas" prefijo="ventas-vista" opciones={vistasVentas} activa={vista} seleccionar={setVista} />
      {mensaje && <p role="status" className="mensaje-exito">{mensaje}</p>}
      {ventaRegistrada !== null && <div>
        <button type="button" onClick={() => setComprobante(ventaRegistrada)}>Ver comprobante de la venta #{ventaRegistrada}</button>
      </div>}
      {error && <p role="alert" className="error">{error}</p>}
      {pendiente && (
        <section className="panel ventas-incertidumbre" role="alert">
          <p>El resultado de la venta {pendiente !== "pendiente" && `#${pendiente} `}es incierto. Revisa el historial antes de intentar otra vez.</p>
          <button type="button" onClick={() => {
            if (!window.confirm("¿Ya verificaste si la venta quedó confirmada o como borrador?")) return;
            sessionStorage.removeItem(clavePendiente);
            setPendiente("");
          }}>Ya revisé el historial</button>
        </section>
      )}
      <div id="ventas-vista-nueva" className="ventas-vista-nueva" hidden={vista !== "nueva"}>
        <section className="panel ventas-turno" aria-labelledby="ventas-turno">
          <div className="ventas-turno-titulo">
            <span className="ventas-icono"><Icono trazado={iconos.caja} /></span>
            <h2 id="ventas-turno">Turno de caja</h2>
          </div>
          {!catalogo && <p role="status">Consultando catálogo y cajas…</p>}
          {catalogo?.error && <p role="alert" className="error">{catalogo.error}</p>}
          {catalogo?.datos && <>
            {turnos.length ? <div className="campos-producto ventas-campos"><label>Turno abierto
              <select value={turnoId} onChange={(e) => setTurno(e.target.value)} disabled={bloqueado}>
                <option value="">Selecciona un turno</option>
                {turnos.map((t) => <option key={t.ID_TURNO_CAJA} value={t.ID_TURNO_CAJA}>{t.NOMBRE_CAJA} · Turno #{t.ID_TURNO_CAJA}</option>)}
              </select>
            </label></div> : <p><strong>Sin turno abierto.</strong> Abre un turno en Caja para registrar ventas.</p>}
            <button className="secundario" type="button" disabled={bloqueado} onClick={onIrACaja}>Ir a Caja</button>
          </>}
        </section>
        <a className="ventas-enlace-carrito" href="#ventas-carrito">Ir a venta actual · {lineas.length} · {importe(Number(total) / 100)}</a>
        <div className="pos-layout">
          <CatalogoVenta productos={productos} lineas={lineas} bloqueado={bloqueado} listo={Boolean(catalogo?.datos)}
            agregar={(producto, unidadesIniciales) => setLineas((actuales) => (
              actuales.length < 100 && !actuales.some((l) => l.productoId === producto.ID_PRODUCTO)
                ? [...actuales, { productoId: producto.ID_PRODUCTO, cantidad: String(unidadesIniciales) }] : actuales
            ))} />
          <section id="ventas-carrito" className="panel pos-venta" aria-labelledby="ventas-actual" tabIndex={-1}>
            <div className="pos-venta-cabecera"><h2 id="ventas-actual">Venta actual</h2><a href="#ventas-catalogo" className="ventas-volver-catalogo">Volver al catálogo</a></div>
            <form onSubmit={prepararVenta}>
              <fieldset className="ventas-campos" disabled={bloqueado || !catalogo?.datos}>
                <legend>Productos seleccionados</legend>
                {detalle.length === 0 && <EstadoVacio icono="venta" titulo="Tu carrito está vacío">
                  Agrega un producto del catálogo para comenzar.
                </EstadoVacio>}
                {detalle.map((linea) => (
                  <div className="campos-producto ventas-fila ventas-linea" key={linea.productoId}>
                    <span><strong>{linea.producto?.NOMBRE_PRODUCTO ?? `Producto #${linea.productoId} fuera del catálogo`}</strong>
                      {linea.producto && <small className="pos-stock">{importe(linea.producto.PRECIO_VENTA_ACTUAL)} / {linea.producto.CODIGO_UNIDAD}</small>}
                    </span>
                    <label>Cantidad {linea.producto?.CODIGO_UNIDAD}<input type="number" required value={linea.cantidad}
                      min={linea.producto?.PERMITE_DECIMALES === "N" ? "1" : "0.001"}
                      max={linea.producto?.STOCK_ACTUAL} step={linea.producto?.PERMITE_DECIMALES === "N" ? "1" : "0.001"}
                      onChange={(e) => setLineas(lineas.map((l) => l.productoId === linea.productoId ? { ...l, cantidad: e.target.value } : l))} /></label>
                    <span className="ventas-subtotal"><small>Subtotal</small><strong>{importe(Number(linea.subtotal) / 100)}</strong></span>
                    <button className="peligro" type="button" onClick={() => setLineas(lineas.filter((l) => l.productoId !== linea.productoId))}>Quitar</button>
                  </div>
                ))}
                <div className="ventas-cobro">
                  <div className="ventas-pagos">
                    <h3 className="ventas-boton-icono"><Icono trazado={iconos.pago} /> Cobro</h3>
                    <button className="secundario" type="button" disabled={pagos.length >= 100 || metodos.length === 0} onClick={() => {
                      const restante = total - pagado;
                      setPagos([...pagos, { clave: ++proximoPago.current, metodoId: "", monto: restante > 0n ? (Number(restante) / 100).toFixed(2) : "", comprobante: "" }]);
                    }}>Añadir pago</button>
                  </div>
                  {pagos.map((pago) => {
                    const requiere = metodos.find((m) => m.ID_METODO_PAGO === Number(pago.metodoId))?.REQUIERE_COMPROBANTE === "S";
                    const cambiar = (campo, valor) => setPagos(pagos.map((p) => p.clave === pago.clave ? { ...p, [campo]: valor } : p));
                    return <div className="campos-producto ventas-fila ventas-pago" key={pago.clave}>
                      <label>Método<select required value={pago.metodoId} onChange={(e) => cambiar("metodoId", e.target.value)}>
                        <option value="">Selecciona un método</option>
                        {metodos.map((m) => <option key={m.ID_METODO_PAGO} value={m.ID_METODO_PAGO}>{m.NOMBRE_METODO}</option>)}
                      </select></label>
                      <label>Importe<input type="number" required min="0.01" step="0.01" value={pago.monto} onChange={(e) => cambiar("monto", e.target.value)} /></label>
                      <label>Comprobante {requiere ? "(obligatorio)" : "(opcional)"}
                        <input required={requiere} maxLength={50} value={pago.comprobante} onChange={(e) => cambiar("comprobante", e.target.value)} /></label>
                      <button className="peligro" type="button" onClick={() => setPagos(pagos.filter((p) => p.clave !== pago.clave))}>Quitar pago</button>
                    </div>;
                  })}
                  <div className="ventas-total">
                    <dl><div><dt>Total de venta</dt><dd>{importe(Number(total) / 100)}</dd></div>
                      <div><dt>Pagado</dt><dd>{importe(Number(pagado) / 100)}</dd></div>
                      <div><dt>Diferencia</dt><dd>{importe(Number(total - pagado) / 100)}</dd></div></dl>
                    <button type="submit" disabled={!turnoId || Boolean(pendiente) || !lineas.length}>Revisar venta</button>
                  </div>
                </div>
              </fieldset>
            </form>
            {confirmacion && <div className="formulario-producto ventas-confirmacion" role="group" aria-label="Confirmar venta" aria-busy={ocupado}>
              <h3>Confirmar venta</h3>
              {ocupado && <p role="status">Registrando la venta…</p>}
              <ul>{detalle.map((linea) => <li key={linea.productoId}>{linea.producto.NOMBRE_PRODUCTO} · {cantidad.format(linea.milesimas / 1000)} {linea.producto.CODIGO_UNIDAD} · {importe(Number(linea.subtotal) / 100)}</li>)}</ul>
              <p>Turno #{confirmacion.turnoId} · <strong>Total {importe(confirmacion.totalEsperado)}</strong></p>
              {confirmacion.pagos.length > 0 && <p>Pagos: {confirmacion.pagos.map((p) => `${metodos.find((m) => m.ID_METODO_PAGO === p.metodoId)?.NOMBRE_METODO} ${importe(p.monto)}`).join(" · ")}</p>}
              <div className="acciones-formulario">
                <button className="secundario" type="button" disabled={ocupado} onClick={() => setConfirmacion(null)}>Cancelar</button>
                <button type="button" disabled={ocupado} onClick={registrar}>{ocupado ? "Registrando…" : "Confirmar venta"}</button>
              </div>
            </div>}
          </section>
        </div>
      </div>
      <div id="ventas-vista-historial" hidden={vista !== "historial"}>
        <HistorialVentas revision={revision} ocupado={bloqueado} anular={anular} verComprobante={setComprobante} />
      </div>
      {comprobante !== null && <Comprobante key={comprobante} ventaId={comprobante} cerrar={() => setComprobante(null)} />}
    </div>
  );
}

