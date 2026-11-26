import { useEffect, useRef, useState } from "react";
import "./Inventario.css";
import { CabeceraModulo, EtiquetaEstado, TarjetaDato } from "./Presentacion.jsx";
import NuevoInsumo from "./NuevoInsumo.jsx";
import { useBorrador } from "./borradores.js";

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

export default function Inventario({ onAjusteRegistrado, busquedaInicial = "", soloInsumos = false, ajusteInicial = null,
  borradorInsumo, cambiarBorrador, crearProveedor }) {
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [filtro, setFiltro] = useState("TODOS");
  const modulo = soloInsumos ? "insumos" : "inventario";
  const [formulario, setFormulario] = useBorrador(modulo, "ajuste", {
    ...formularioVacio, clave: ajusteInicial ? `PRODUCTO:${ajusteInicial.id}` : ""
  }, (datos) => Object.values(datos).some(Boolean));
  const [sentido, setSentido] = useBorrador(modulo, "sentido", ajusteInicial?.sentido ?? 0, () => false);
  const [confirmacion, setConfirmacion] = useState(null);
  const [guardando, setGuardando] = useBorrador(modulo, "envio-ajuste", false, () => false);
  const [mensaje, setMensaje] = useState("");
  const [alta, setAlta] = useState("");
  const [errorInsumo, setErrorInsumo] = useState("");
  const [gestionando, setGestionando] = useBorrador(modulo, "envioGestion", false, () => false);
  const [errorAjuste, setErrorAjuste] = useState("");
  const [revision, setRevision] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [catalogo, setCatalogo] = useState(null);
  const [historial, setHistorial] = useState(null);
  const envioPendiente = useRef(false);
  const campoCantidad = useRef(null);

  useEffect(() => {
    const controlador = new AbortController();
    consultar(soloInsumos ? "?incluirInactivos=1" : "", controlador.signal).then(
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
  }, [revision, soloInsumos]);

  useEffect(() => {
    if (soloInsumos) return;
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
  }, [pagina, revision, soloInsumos]);

  const cargandoCatalogo = catalogo?.revision !== revision;
  const cargandoHistorial = historial?.revision !== revision || historial?.pagina !== pagina;
  const articulos = (catalogo?.articulos ?? []).filter((articulo) => !soloInsumos || articulo.tipo === "INSUMO");
  const activos = articulos.filter((articulo) => articulo.ESTADO_ACTIVO !== "N");
  const tipos = (catalogo?.tipos ?? []).filter((tipo) => !sentido || tipo.FACTOR_OPERACION === sentido);
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

  function elegirArticulo(articulo, factor) {
    setSentido(factor);
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

  async function editarInsumo(id) {
    setGestionando(true);
    setAlta("");
    setErrorInsumo("");
    try {
      const { insumo } = await consultar(`/insumos/${id}`);
      cambiarBorrador({
        id, nombre: insumo.NOMBRE_INSUMO, unidadId: String(insumo.ID_UNIDAD), proveedorId: String(insumo.ID_PROVEEDOR),
        costo: String(insumo.COSTO_UNITARIO), stockCritico: String(insumo.STOCK_CRITICO), estado: insumo.ESTADO_ACTIVO
      });
    } catch (error) {
      setErrorInsumo(error.message);
    } finally {
      setGestionando(false);
    }
  }

  async function eliminarInsumo(articulo) {
    if (gestionando || !window.confirm(`¿Eliminar "${articulo.nombre}"?`)) return;
    setGestionando(true);
    setAlta("");
    setErrorInsumo("");
    try {
      const respuesta = await fetch(`${api}/insumos/${articulo.id}`, { method: "DELETE" });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        setErrorInsumo(datos.mensaje);
        if (datos.estado === "INCIERTO") actualizar();
        return;
      }
      if (formulario.clave === articulo.clave) setFormulario(formularioVacio);
      setAlta("Insumo eliminado.");
      actualizar();
    } catch {
      setErrorInsumo("No se pudo confirmar la eliminación. Revisa las existencias antes de volver a intentarlo.");
      actualizar();
    } finally {
      setGestionando(false);
    }
  }

  const bloqueado = guardando || gestionando || Boolean(confirmacion);

  return (
    <div className={`inventario modulo ${soloInsumos ? "inventario-insumos" : "inventario-general"}`}>
      <CabeceraModulo modulo={soloInsumos ? "insumos" : "inventario"} titulo={soloInsumos ? "Insumos" : "Inventario"}
        descripcion={soloInsumos ? "Consulta las materias primas y ajusta sus existencias." : "Consulta existencias y revisa los movimientos de stock."}>
        <button className="secundario" type="button" onClick={actualizar}
          disabled={bloqueado || cargandoCatalogo || (!soloInsumos && cargandoHistorial)}>Actualizar</button>
        {soloInsumos && !borradorInsumo && <button type="button" disabled={bloqueado} onClick={() => {
          setAlta("");
          setErrorInsumo("");
          cambiarBorrador({ nombre: "", unidadId: "", proveedorId: "", costo: "0", stockInicial: "0", stockCritico: "0", estado: "S" });
        }}>+ Nuevo insumo</button>}
      </CabeceraModulo>

      {soloInsumos && alta && <p className="mensaje-exito" role="status">{alta}</p>}
      {soloInsumos && errorInsumo && <p className="error" role="alert">{errorInsumo}</p>}
      {soloInsumos && borradorInsumo && <NuevoInsumo datos={borradorInsumo} cambiar={cambiarBorrador}
        cancelar={() => cambiarBorrador(null)} crearProveedor={crearProveedor} revisarExistencias={actualizar}
        alGuardar={(id) => {
          setAlta(`Insumo ${borradorInsumo.id === undefined ? "registrado" : "actualizado"} correctamente (ID ${id}).`);
          setBusqueda(borradorInsumo.nombre.trim());
          cambiarBorrador(null);
          actualizar();
        }} />}
      {!cargandoCatalogo && !catalogo?.error && <dl className="resumen-modulo">
        <TarjetaDato titulo="Artículos activos" tono="dorado" arte="ingredientes" icono="M4 7h16v13H4z M3 4h18v3H3z">{activos.length}</TarjetaDato>
        <TarjetaDato titulo="En stock crítico" tono="lavanda" arte="abastecimiento" icono="M12 3 2 20h20z M12 9v4m0 3h.01">{activos.filter((a) => a.STOCK_ACTUAL <= a.STOCK_CRITICO).length}</TarjetaDato>
      </dl>}
      <div className="inventario-distribucion">
      <section className={soloInsumos ? "panel insumos-existencias" : "panel"}>
        <h2>Existencias</h2>
        <div className="inventario-filtros campos-producto">
          <label>Buscar por nombre o código de barras
            <input type="search" placeholder="Buscar artículo…" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
          </label>
          {!soloInsumos && <label>Tipo de artículo
            <select value={filtro} onChange={(evento) => setFiltro(evento.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="PRODUCTO">Productos</option>
              <option value="INSUMO">Insumos</option>
            </select>
          </label>}
        </div>
        {cargandoCatalogo && <p role="status">Consultando existencias…</p>}
        {!cargandoCatalogo && catalogo?.error && <p role="alert" className="error">{catalogo.error}</p>}
        <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Existencias">
          <table aria-label={soloInsumos ? "Existencias de insumos" : "Existencias de artículos activos"}>
            <thead><tr><th>Artículo</th><th>Tipo</th><th>Unidad</th><th>Stock actual</th><th>Stock crítico</th><th>{soloInsumos ? "Acciones" : "Ajuste"}</th></tr></thead>
            <tbody>
              {visibles.map((articulo) => (
                <tr key={articulo.clave}>
                  <td>{articulo.nombre} {articulo.ESTADO_ACTIVO === "N" && <EtiquetaEstado tono="neutro">Inactivo</EtiquetaEstado>}</td>
                  <td><EtiquetaEstado tono={articulo.tipo === "PRODUCTO" ? "neutro" : "acento"}>{nombresTipo[articulo.tipo]}</EtiquetaEstado></td>
                  <td>{articulo.CODIGO_UNIDAD}</td>
                  <td>
                    {formatoCantidad.format(articulo.STOCK_ACTUAL)}
                    {articulo.ESTADO_ACTIVO !== "N" && articulo.STOCK_ACTUAL <= articulo.STOCK_CRITICO && <EtiquetaEstado tono="alerta">Stock bajo</EtiquetaEstado>}
                  </td>
                  <td>{formatoCantidad.format(articulo.STOCK_CRITICO)}</td>
                  <td><div className="acciones-formulario">
                    {articulo.ESTADO_ACTIVO !== "N" && <>
                      <button type="button" disabled={bloqueado || cargandoCatalogo}
                        onClick={() => elegirArticulo(articulo, 1)}>Añadir stock</button>
                      <button className="secundario" type="button" disabled={bloqueado || cargandoCatalogo}
                        onClick={() => elegirArticulo(articulo, -1)}>Quitar stock</button>
                    </>}
                    {soloInsumos && <>
                      <button className="secundario" type="button" disabled={bloqueado || cargandoCatalogo || Boolean(borradorInsumo)}
                        onClick={() => editarInsumo(articulo.id)}>Editar</button>
                      <button className="peligro" type="button" disabled={bloqueado || cargandoCatalogo || Boolean(borradorInsumo)}
                        onClick={() => eliminarInsumo(articulo)}>Eliminar</button>
                    </>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cargandoCatalogo && !catalogo?.error && visibles.length === 0 && <p className="modulo-vacio">No hay artículos que coincidan con la búsqueda.</p>}
      </section>

      <section className="panel modulo-operacion">
        <h2>{sentido === 1 ? "Añadir stock" : sentido === -1 ? "Quitar stock" : "Registrar ajuste"}</h2>
        <p id="ayuda-ajuste" className="modulo-ayuda">Los ingresos suman existencias. Las salidas, incluidas las mermas, las reducen.</p>
        <form onSubmit={prepararAjuste} aria-describedby={errorAjuste ? "ayuda-ajuste error-ajuste" : "ayuda-ajuste"}>
          <fieldset className="campos-producto inventario-campos" disabled={bloqueado || cargandoCatalogo || Boolean(catalogo?.error)}>
            <label>Artículo (obligatorio)
              <select name="clave" required value={seleccionado?.clave ?? ""} onChange={cambiarCampo}>
                <option value="">Selecciona un artículo</option>
                {activos.map((articulo) => <option key={articulo.clave} value={articulo.clave}>
                  {articulo.nombre} ({nombresTipo[articulo.tipo]})
                </option>)}
              </select>
            </label>
            <label>Tipo de ajuste (obligatorio)
              <select name="tipoAjusteId" required value={formulario.tipoAjusteId} onChange={cambiarCampo}>
                <option value="">Selecciona un tipo de ajuste</option>
                {tipos.map((tipo) => <option key={tipo.ID_TIPO_AJUSTE} value={tipo.ID_TIPO_AJUSTE}>
                  {tipo.NOMBRE_TIPO_AJUSTE} ({tipo.FACTOR_OPERACION === 1 ? "ingreso" : "salida"})
                </option>)}
              </select>
            </label>
            <label>Cantidad obligatoria {seleccionado && `(${seleccionado.CODIGO_UNIDAD})`}
              <input ref={campoCantidad} name="cantidad" type="number" required
                min={seleccionado?.PERMITE_DECIMALES === "N" ? "1" : "0.001"}
                max="999999999.999" step={seleccionado?.PERMITE_DECIMALES === "N" ? "1" : "0.001"}
                value={formulario.cantidad} onChange={cambiarCampo} />
            </label>
            {seleccionado?.tipo === "PRODUCTO" && <label>Observación (opcional)
              <input name="observacion" maxLength={250} value={formulario.observacion} onChange={cambiarCampo} />
            </label>}
            <div className="acciones-formulario">
              <button type="submit">Revisar ajuste</button>
              <button type="button" className="secundario" onClick={() => {
                setFormulario(formularioVacio);
                setSentido(0);
                setErrorAjuste("");
              }}>Limpiar ajuste</button>
            </div>
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
      </div>

      {!soloInsumos && <section className="panel">
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
      </section>}
    </div>
  );
}
