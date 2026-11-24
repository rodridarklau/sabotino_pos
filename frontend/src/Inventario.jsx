import { useEffect, useRef, useState } from "react";
import "./Inventario.css";
import { CabeceraModulo, EtiquetaEstado } from "./Presentacion.jsx";

const api = "/api/inventario";
const maximoMilesimas = 999999999999;
const formularioVacio = { clave: "", tipoAjusteId: "", cantidad: "", observacion: "" };
const formatoCantidad = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 3 });
const nombresTipo = { PRODUCTO: "Producto", INSUMO: "Insumo" };

async function consultar(ruta, signal) {
  const respuesta = await fetch(`${api}${ruta}`, { signal });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudo completar la consulta");
  return datos;
}

function normalizarArticulos({ productos, insumos }) {
  return [
    ...productos.map((fila) => ({
      ...fila, tipo: "PRODUCTO", id: fila.ID_PRODUCTO, nombre: fila.NOMBRE_PRODUCTO,
      clave: `PRODUCTO:${fila.ID_PRODUCTO}`
    })),
    ...insumos.map((fila) => ({
      ...fila, tipo: "INSUMO", id: fila.ID_INSUMO, nombre: fila.NOMBRE_INSUMO,
      clave: `INSUMO:${fila.ID_INSUMO}`
    }))
  ];
}

export default function Inventario({ onAjusteRegistrado, busquedaInicial = "" }) {
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [filtro, setFiltro] = useState("TODOS");
  const [formulario, setFormulario] = useState(formularioVacio);
  const [confirmacion, setConfirmacion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [errorAjuste, setErrorAjuste] = useState("");
  const [revision, setRevision] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [catalogo, setCatalogo] = useState(null);
  const [historial, setHistorial] = useState(null);
  const envioPendiente = useRef(false);
  const campoCantidad = useRef(null);

  useEffect(() => {
    const controlador = new AbortController();
    consultar("", controlador.signal).then(
      (datos) => {
        if (!controlador.signal.aborted) {
          setCatalogo({ revision, articulos: normalizarArticulos(datos), tipos: datos.tipos });
        }
      },
      (error) => {
        if (!controlador.signal.aborted) setCatalogo({ revision, error: error.message });
      }
    );
    return () => controlador.abort();
  }, [revision]);

  useEffect(() => {
    const controlador = new AbortController();
    consultar(`/historial?pagina=${pagina}`, controlador.signal).then(
      (datos) => {
        if (!controlador.signal.aborted) setHistorial({ revision, pagina, ...datos });
      },
      (error) => {
        if (!controlador.signal.aborted) setHistorial({ revision, pagina, error: error.message });
      }
    );
    return () => controlador.abort();
  }, [pagina, revision]);

  const cargandoCatalogo = catalogo?.revision !== revision;
  const cargandoHistorial = historial?.revision !== revision || historial?.pagina !== pagina;
  const articulos = catalogo?.articulos ?? [];
  const tipos = catalogo?.tipos ?? [];
  const seleccionado = articulos.find((articulo) => articulo.clave === formulario.clave);
  const texto = busqueda.trim().toLocaleLowerCase();
  const visibles = articulos.filter((articulo) =>
    (filtro === "TODOS" || articulo.tipo === filtro) &&
    (articulo.nombre.toLocaleLowerCase().includes(texto) || articulo.CODIGO_BARRA?.toLowerCase().includes(texto))
  );

  function actualizar() {
    setConfirmacion(null);
    setRevision((anterior) => anterior + 1);
  }

  function cambiarCampo(evento) {
    const { name, value } = evento.target;
    setFormulario((anterior) => ({
      ...anterior, [name]: value, ...(name === "clave" ? { observacion: "" } : {})
    }));
    setErrorAjuste("");
  }

  function elegirArticulo(articulo) {
    setFormulario({ ...formularioVacio, clave: articulo.clave });
    setMensaje("");
    setErrorAjuste("");
    campoCantidad.current?.focus();
  }

  function prepararAjuste(evento) {
    evento.preventDefault();
    const tipo = tipos.find((item) => item.ID_TIPO_AJUSTE === Number(formulario.tipoAjusteId));
    const observacion = formulario.observacion.trim();
    const cantidad = Number(formulario.cantidad);
    const milesimas = Math.round(cantidad * 1000);
    setMensaje("");
    if (!seleccionado || !tipo) return setErrorAjuste("Selecciona el artículo y el tipo de ajuste.");
    if (!/^\d+(?:\.\d{1,3})?$/.test(formulario.cantidad) || milesimas <= 0 || milesimas > maximoMilesimas) {
      return setErrorAjuste("Ingresa una cantidad positiva con hasta tres decimales.");
    }
    if (seleccionado.PERMITE_DECIMALES === "N" && !Number.isInteger(cantidad)) {
      return setErrorAjuste("La unidad del artículo requiere cantidades enteras.");
    }
    if (new TextEncoder().encode(observacion).length > 250) {
      return setErrorAjuste("La observación puede ocupar hasta 250 bytes.");
    }
    const saldo = Math.round(seleccionado.STOCK_ACTUAL * 1000) + milesimas * tipo.FACTOR_OPERACION;
    if (saldo < 0 || saldo > maximoMilesimas) {
      return setErrorAjuste(saldo < 0
        ? "El ajuste dejaría el stock en negativo."
        : "El saldo excedería la precisión de Oracle.");
    }
    setErrorAjuste("");
    setConfirmacion({ articulo: seleccionado, tipo, cantidad, observacion, saldo: saldo / 1000 });
  }

  async function registrarAjuste() {
    if (!confirmacion || envioPendiente.current) return;
    envioPendiente.current = true;
    setGuardando(true);
    setErrorAjuste("");
    const { articulo, tipo, cantidad, observacion } = confirmacion;
    try {
      const respuesta = await fetch(`${api}/ajustes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoArticulo: articulo.tipo, articuloId: articulo.id,
          tipoAjusteId: tipo.ID_TIPO_AJUSTE, cantidad,
          ...(articulo.tipo === "PRODUCTO" ? { observacion } : {})
        })
      });
      const datos = await respuesta.json();
      if (!respuesta.ok && datos.estado === "ERROR") {
        setErrorAjuste(datos.mensaje || "No se pudo registrar el ajuste.");
        actualizar();
        return;
      }
      if (!respuesta.ok || datos.estado !== "OK") throw new Error("Resultado incierto");
      setMensaje(datos.idAjuste !== undefined
        ? `Ajuste registrado. Identificador ${datos.idAjuste}.`
        : `Ajuste registrado. Nuevo stock ${formatoCantidad.format(datos.nuevoStock)} ${articulo.CODIGO_UNIDAD}.`);
    } catch {
      setErrorAjuste("No se pudo confirmar el resultado. Revisa las existencias y, para productos, el historial antes de volver a registrar el ajuste.");
    } finally {
      envioPendiente.current = false;
      setGuardando(false);
      setConfirmacion(null);
    }

    setFormulario(formularioVacio);
    setPagina(1);
    actualizar();
    void onAjusteRegistrado();
  }

  const bloqueado = guardando || Boolean(confirmacion);

  return (
    <div className="inventario modulo">
      <CabeceraModulo modulo="inventario" titulo="Inventario" descripcion="Consulta existencias y revisa los movimientos de stock.">
        <button className="secundario" type="button" onClick={actualizar}
          disabled={bloqueado || cargandoCatalogo || cargandoHistorial}>Actualizar</button>
      </CabeceraModulo>

      <section className="panel">
        <h2>Existencias</h2>
        {!cargandoCatalogo && !catalogo?.error && <dl className="modulo-metricas">
          <div><dt>Artículos activos</dt><dd>{articulos.length}</dd></div>
          <div><dt>En stock crítico</dt><dd>{articulos.filter((a) => a.STOCK_ACTUAL <= a.STOCK_CRITICO).length}</dd></div>
        </dl>}
        <div className="inventario-filtros campos-producto">
          <label>Buscar por nombre o código de barras
            <input type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
          </label>
          <label>Tipo de artículo
            <select value={filtro} onChange={(evento) => setFiltro(evento.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="PRODUCTO">Productos</option>
              <option value="INSUMO">Insumos</option>
            </select>
          </label>
        </div>
        {cargandoCatalogo && <p role="status">Consultando existencias…</p>}
        {!cargandoCatalogo && catalogo?.error && <p role="alert" className="error">{catalogo.error}</p>}
        <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Existencias">
          <table aria-label="Existencias de artículos activos">
            <thead><tr><th>Artículo</th><th>Tipo</th><th>Unidad</th><th>Stock actual</th><th>Stock crítico</th><th>Ajuste</th></tr></thead>
            <tbody>
              {visibles.map((articulo) => (
                <tr key={articulo.clave}>
                  <td>{articulo.nombre}</td>
                  <td><EtiquetaEstado tono={articulo.tipo === "PRODUCTO" ? "neutro" : "acento"}>{nombresTipo[articulo.tipo]}</EtiquetaEstado></td>
                  <td>{articulo.CODIGO_UNIDAD}</td>
                  <td>
                    {formatoCantidad.format(articulo.STOCK_ACTUAL)}
                    {articulo.STOCK_ACTUAL <= articulo.STOCK_CRITICO && <EtiquetaEstado tono="alerta">Stock bajo</EtiquetaEstado>}
                  </td>
                  <td>{formatoCantidad.format(articulo.STOCK_CRITICO)}</td>
                  <td><button type="button" disabled={bloqueado || cargandoCatalogo}
                    onClick={() => elegirArticulo(articulo)}>Ajustar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cargandoCatalogo && !catalogo?.error && visibles.length === 0 && <p className="modulo-vacio">No hay artículos que coincidan con la búsqueda.</p>}
      </section>

      <section className="panel modulo-operacion">
        <h2>Registrar ajuste</h2>
        <p id="ayuda-ajuste" className="modulo-ayuda">Los ingresos suman existencias. Las salidas, incluidas las mermas, las reducen.</p>
        <form onSubmit={prepararAjuste} aria-describedby={errorAjuste ? "ayuda-ajuste error-ajuste" : "ayuda-ajuste"}>
          <fieldset className="campos-producto inventario-campos" disabled={bloqueado || cargandoCatalogo || Boolean(catalogo?.error)}>
            <label>Artículo
              <select name="clave" required value={seleccionado?.clave ?? ""} onChange={cambiarCampo}>
                <option value="">Selecciona un artículo</option>
                {articulos.map((articulo) => <option key={articulo.clave} value={articulo.clave}>
                  {articulo.nombre} ({nombresTipo[articulo.tipo]})
                </option>)}
              </select>
            </label>
            <label>Tipo de ajuste
              <select name="tipoAjusteId" required value={formulario.tipoAjusteId} onChange={cambiarCampo}>
                <option value="">Selecciona un tipo de ajuste</option>
                {tipos.map((tipo) => <option key={tipo.ID_TIPO_AJUSTE} value={tipo.ID_TIPO_AJUSTE}>
                  {tipo.NOMBRE_TIPO_AJUSTE} ({tipo.FACTOR_OPERACION === 1 ? "ingreso" : "salida"})
                </option>)}
              </select>
            </label>
            <label>Cantidad {seleccionado && `(${seleccionado.CODIGO_UNIDAD})`}
              <input ref={campoCantidad} name="cantidad" type="number" required
                min={seleccionado?.PERMITE_DECIMALES === "N" ? "1" : "0.001"}
                max="999999999.999" step={seleccionado?.PERMITE_DECIMALES === "N" ? "1" : "0.001"}
                value={formulario.cantidad} onChange={cambiarCampo} />
            </label>
            {seleccionado?.tipo === "PRODUCTO" && <label>Observación (opcional)
              <input name="observacion" maxLength={250} value={formulario.observacion} onChange={cambiarCampo} />
            </label>}
            <div><button type="submit">Revisar ajuste</button></div>
          </fieldset>
        </form>
        {confirmacion && (
          <div className="formulario-producto modulo-confirmacion" role="group" aria-label="Confirmar ajuste">
            <h3>Confirmar ajuste</h3>
            <p>{confirmacion.tipo.NOMBRE_TIPO_AJUSTE} de {formatoCantidad.format(confirmacion.cantidad)} {confirmacion.articulo.CODIGO_UNIDAD} para <strong>{confirmacion.articulo.nombre}</strong>.</p>
            <p>Stock estimado después del ajuste {formatoCantidad.format(confirmacion.saldo)} {confirmacion.articulo.CODIGO_UNIDAD}.</p>
            {confirmacion.observacion && <p>Observación: {confirmacion.observacion}</p>}
            <div className="acciones-formulario">
              <button type="button" className="secundario" disabled={guardando} onClick={() => setConfirmacion(null)}>Cancelar</button>
              <button type="button" disabled={guardando} onClick={registrarAjuste}>
                {guardando ? "Registrando…" : "Confirmar ajuste"}
              </button>
            </div>
          </div>
        )}
        {mensaje && <p className="mensaje-exito" role="status">{mensaje}</p>}
        {errorAjuste && <p id="error-ajuste" className="error" role="alert">{errorAjuste}</p>}
      </section>

      <section className="panel">
        <h2>Historial de ajustes de productos</h2>
        {cargandoHistorial && <p role="status">Consultando historial…</p>}
        {!cargandoHistorial && historial?.error && <p className="error" role="alert">{historial.error}</p>}
        {!cargandoHistorial && historial?.ajustes?.length === 0 && <p className="modulo-vacio">No hay ajustes en esta página.</p>}
        {!cargandoHistorial && Boolean(historial?.ajustes?.length) && (
          <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Historial de ajustes">
            <table aria-label="Ajustes de productos">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Observación</th><th>Responsable</th></tr></thead>
              <tbody>
                {historial.ajustes.map((ajuste) => (
                  <tr key={ajuste.ID_AJUSTE}>
                    <td>{ajuste.FECHA}</td><td>{ajuste.NOMBRE_PRODUCTO}</td><td>{ajuste.NOMBRE_TIPO_AJUSTE}</td>
                    <td>{ajuste.FACTOR_OPERACION === -1 ? "−" : "+"}{formatoCantidad.format(ajuste.CANTIDAD_AJUSTADA)} {ajuste.CODIGO_UNIDAD}</td>
                    <td>{ajuste.OBSERVACION || "—"}</td><td>{ajuste.RESPONSABLE}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(pagina > 1 || historial?.hayMas) && (
          <div className="acciones-formulario">
            <button type="button" className="secundario" disabled={pagina === 1 || cargandoHistorial}
              onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <span>Página {pagina}</span>
            <button type="button" className="secundario" disabled={!historial?.hayMas || cargandoHistorial}
              onClick={() => setPagina(pagina + 1)}>Siguiente</button>
          </div>
        )}
      </section>
    </div>
  );
}
