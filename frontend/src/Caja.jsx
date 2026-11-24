import { useEffect, useRef, useState } from "react";
import "./Caja.css";
import { CabeceraModulo, EtiquetaEstado, PestanasModulo } from "./Presentacion.jsx";

const vistasCaja = [["turno", "Turno actual"], ["terminales", "Terminales"], ["historial", "Historial de turnos"]];

const api = "/api/caja";
const formato = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinero = (valor) => valor == null ? "—" : `$ ${formato.format(valor)}`;
const aCentavos = (valor) => Math.round(valor * 100);
const metodos = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];
const cajaVacia = { nombre: "", ubicacion: "", estado: "S" };
const conteoVacio = { efectivo: "", tarjeta: "", transferencia: "" };

function monto(texto) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const valor = Number(texto);
  return aCentavos(valor) <= 99999999999999 ? valor : null;
}

async function solicitar(ruta, opciones) {
  const respuesta = await fetch(`${api}${ruta}`, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw Object.assign(new Error(datos.mensaje || "No se pudo completar la operación"), datos, { codigo: respuesta.status });
  return datos;
}

function useCaja(ruta, revision) {
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

function EstadoConsulta({ consulta, texto }) {
  if (!consulta) return <p role="status">{texto}</p>;
  if (consulta.error) return <p role="alert" className="error">{consulta.error}</p>;
  return null;
}

function Paginacion({ pagina, hayMas, cambiar }) {
  if (pagina === 1 && !hayMas) return null;
  return <div className="acciones-formulario caja-paginas">
    <button type="button" disabled={pagina === 1} onClick={() => cambiar(pagina - 1)}>Anterior</button>
    <span>Página {pagina}</span>
    <button type="button" disabled={!hayMas} onClick={() => cambiar(pagina + 1)}>Siguiente</button>
  </div>;
}

function TurnoDetalle({ datos, ocupado, cerrarTurno }) {
  const [conteo, setConteo] = useState(conteoVacio);
  const [confirmar, setConfirmar] = useState(false);
  const { turno, pagos, ventas, auditoria, borradores } = datos;
  const abierto = turno.ESTADO_TURNO === "ABIERTO";
  const filas = metodos.map((metodo) => {
    const inicial = turno[`INICIAL_${metodo}`];
    const cobrado = pagos.find((pago) => pago.NOMBRE_METODO === metodo)?.TOTAL ?? 0;
    const esperado = abierto
      ? (aCentavos(inicial) + aCentavos(cobrado)) / 100
      : turno[`CIERRE_SISTEMA_${metodo}`];
    const clave = metodo.toLowerCase();
    const real = abierto ? monto(conteo[clave]) : turno[`CIERRE_REAL_${metodo}`];
    const diferencia = real == null || esperado == null ? null : (aCentavos(real) - aCentavos(esperado)) / 100;
    return { metodo, clave, inicial, cobrado, esperado, real, diferencia };
  });
  const puedeCerrar = abierto && borradores === 0 && filas.every((fila) => fila.real != null);
  const total = filas.every((fila) => fila.diferencia != null)
    ? filas.reduce((suma, fila) => suma + aCentavos(fila.diferencia), 0) / 100 : null;
  const cierre = auditoria.find((fila) => fila.TIPO_OPERACION === "CIERRE");

  return <>
    <p className="modulo-contexto">Apertura {turno.APERTURA} · {turno.RESPONSABLE_APERTURA}</p>
    {turno.CIERRE && <p>Cierre {turno.CIERRE} · {turno.RESPONSABLE_CIERRE}</p>}
    <h3>Arqueo por método de pago</h3>
    <form onSubmit={(evento) => {
      evento.preventDefault();
      if (puedeCerrar) setConfirmar(true);
    }}>
      <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Arqueo por método de pago">
        <table aria-label="Arqueo por método de pago">
          <thead><tr><th>Método</th><th>Inicial</th><th>Ventas confirmadas</th><th className="caja-esperado">Esperado</th><th>{abierto ? "Importe contado" : "Importe registrado"}</th><th>Diferencia</th></tr></thead>
          <tbody>{filas.map((fila) => (
            <tr key={fila.metodo}>
              <td>{fila.metodo}</td><td>{dinero(fila.inicial)}</td><td>{dinero(fila.cobrado)}</td><td className="caja-esperado modulo-numero">{dinero(fila.esperado)}</td>
              <td>{abierto ? <input aria-label={`Importe contado de ${fila.clave}`} type="number" min="0"
                max="999999999999.99" step="0.01" required value={conteo[fila.clave]} disabled={ocupado || confirmar}
                onChange={(evento) => setConteo({ ...conteo, [fila.clave]: evento.target.value })} /> : dinero(fila.real)}</td>
              <td className="modulo-numero">{dinero(fila.diferencia)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    <p className="caja-descuadre"><strong>{abierto ? "Diferencia estimada" : "Descuadre de cierre"} {dinero(cierre?.DESCUADRE_TOTAL ?? total)}</strong></p>
      {abierto && borradores > 0 && <p role="status">Hay {borradores} ventas en borrador. Deben resolverse desde Ventas antes de cerrar.</p>}
      {abierto && !confirmar && <button type="submit" disabled={!puedeCerrar || ocupado}>Revisar cierre</button>}
      {confirmar && <div className="formulario-producto modulo-confirmacion" role="group" aria-label="Confirmar cierre">
        <h3>Confirmar cierre del turno #{turno.ID_TURNO_CAJA}</h3>
        <p>Oracle recalculará el importe esperado con las ventas confirmadas al momento del cierre.</p>
        <div className="acciones-formulario">
          <button className="secundario" type="button" disabled={ocupado} onClick={() => setConfirmar(false)}>Cancelar</button>
          <button type="button" disabled={ocupado || !puedeCerrar} onClick={() => cerrarTurno(
            turno.ID_TURNO_CAJA, Object.fromEntries(filas.map((fila) => [fila.clave, fila.real]))
          )}>Confirmar cierre</button>
        </div>
      </div>}
    </form>
    <h3>Ventas asociadas</h3>
    {ventas.length ? <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Ventas del turno"><table aria-label="Ventas del turno">
      <thead><tr><th>ID</th><th>Fecha</th><th>Responsable</th><th>Estado</th><th>Total</th></tr></thead>
      <tbody>{ventas.map((venta) => <tr key={venta.ID_VENTA}>
        <td>{venta.ID_VENTA}</td><td>{venta.FECHA}</td><td>{venta.RESPONSABLE}</td>
        <td>{venta.ESTADO_VENTA}</td><td>{dinero(venta.TOTAL_VENTA)}</td>
      </tr>)}</tbody>
    </table></div> : <p>No hay ventas visibles en esta página.</p>}
    {auditoria.length > 0 && <>
      <h3>Auditoría del turno</h3>
      <ul>{auditoria.map((fila) => <li key={fila.ID_LOG_CAJA}>
        {fila.TIPO_OPERACION} · {fila.FECHA} · {fila.RESPONSABLE}
        {fila.DESCUADRE_TOTAL != null && ` · Descuadre ${dinero(fila.DESCUADRE_TOTAL)}`}
      </li>)}</ul>
    </>}
  </>;
}

export default function Caja({ usuario }) {
  const [vista, setVista] = useState("turno");
  const [vistaDetalle, setVistaDetalle] = useState("turno");
  const [revision, setRevision] = useState(0);
  const [cajaId, setCajaId] = useState("");
  const [inicial, setInicial] = useState("0");
  const [formulario, setFormulario] = useState(null);
  const [turnoId, setTurnoId] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [pagina, setPagina] = useState(1);
  const [paginaVentas, setPaginaVentas] = useState(1);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const enCurso = useRef(false);
  const catalogo = useCaja("", revision);
  const { cajas = [], activos = [] } = catalogo?.datos ?? {};
  const historial = useCaja(`/turnos?pagina=${pagina}${filtro ? `&cajaId=${filtro}` : ""}`, revision);
  const detalle = useCaja(turnoId === null ? null : `/turnos/${turnoId}?pagina=${paginaVentas}`, revision);
  const disponibles = cajas.filter((caja) => caja.ESTADO_OPERATIVO === "S" && !activos.some((t) => t.ID_CAJA === caja.ID_CAJA));
  const seleccion = disponibles.find((caja) => caja.ID_CAJA === Number(cajaId)) ?? (disponibles.length === 1 ? disponibles[0] : null);
  const dueno = usuario.rol === "DUENO";

  function actualizar() {
    setRevision((n) => n + 1);
  }

  function verTurno(id, seccion = "turno") {
    setVistaDetalle(seccion);
    setVista(seccion);
    setTurnoId(id);
    setPaginaVentas(1);
  }

  async function operar(ruta, metodo, cuerpo, alConfirmar) {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setError("");
    setMensaje("");
    try {
      const resultado = await solicitar(ruta, {
        method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
      });
      alConfirmar(resultado);
      actualizar();
    } catch (fallo) {
      setError(fallo.estado === "ERROR" ? fallo.message
        : "No se pudo confirmar la operación. Revisa el estado actualizado antes de repetirla.");
      if (fallo.estado !== "ERROR" || fallo.codigo === 409) actualizar();
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  function abrir(evento) {
    evento.preventDefault();
    const efectivoInicial = monto(inicial);
    if (!seleccion || efectivoInicial === null) return setError("Selecciona una caja e ingresa un monto inicial válido.");
    if (!window.confirm(`¿Abrir ${seleccion.NOMBRE_CAJA} con ${dinero(efectivoInicial)} de efectivo inicial?`)) return;
    void operar("/turnos", "POST", { cajaId: seleccion.ID_CAJA, efectivoInicial }, ({ turnoId }) => {
      setMensaje(`Turno #${turnoId} abierto.`);
      setInicial("0");
      verTurno(turnoId);
    });
  }

  function cerrar(id, importes) {
    void operar(`/turnos/${id}/cierre`, "POST", importes, ({ descuadre }) => {
      setMensaje(`Turno #${id} cerrado. Descuadre registrado: ${dinero(descuadre)}.`);
      setPagina(1);
    });
  }

  function guardar(evento) {
    evento.preventDefault();
    const { id, nombre, ubicacion, estado } = formulario;
    const bytes = new TextEncoder();
    if (!nombre.trim() || bytes.encode(nombre.trim()).length > 50 || bytes.encode(ubicacion.trim()).length > 100) {
      return setError("El nombre es obligatorio. Usa hasta 50 bytes para el nombre y 100 para la ubicación.");
    }
    void operar(id ? `/terminales/${id}` : "/terminales", id ? "PUT" : "POST", { nombre, ubicacion, estado }, ({ cajaId }) => {
      setMensaje(`Caja #${cajaId} ${id ? "actualizada" : "creada"}.`);
      setFormulario(null);
    });
  }

  function eliminar(caja) {
    if (!window.confirm(`¿Eliminar la caja ${caja.NOMBRE_CAJA}? ` +
      "Oracle solo lo permite si no tiene referencias.")) return;
    void operar(`/terminales/${caja.ID_CAJA}`, "DELETE", {}, () => setMensaje("Caja eliminada."));
  }

  function cambiarCaja(evento) {
    setFormulario({ ...formulario, [evento.target.name]: evento.target.value });
  }

  return <div className="caja modulo">
    <CabeceraModulo modulo="caja" titulo="Caja" descripcion="Consulta turnos, administra terminales y revisa el arqueo.">
      <button className="secundario" type="button" disabled={ocupado} onClick={actualizar}>Actualizar</button>
    </CabeceraModulo>
    <PestanasModulo etiqueta="Vistas de Caja" prefijo="caja" opciones={vistasCaja} activa={vista} seleccionar={setVista} />
    {mensaje && <p role="status" className="mensaje-exito">{mensaje}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <section id="caja-terminales" className="panel" hidden={vista !== "terminales"}>
      <div className="panel-encabezado"><h2>Terminales</h2>
        {dueno && <button type="button" disabled={ocupado} onClick={() => setFormulario(cajaVacia)}>Nueva caja</button>}
      </div>
      <EstadoConsulta consulta={catalogo} texto="Consultando cajas…" />
      {catalogo?.datos && !cajas.length && <p>No hay cajas disponibles.</p>}
      {cajas.length > 0 && <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Terminales de caja"><table aria-label="Terminales de caja">
        <thead><tr><th>Caja</th><th>Ubicación</th><th>Estado</th><th>Turno activo</th><th>Turnos registrados</th>{dueno && <th>Acciones</th>}</tr></thead>
        <tbody>{cajas.map((caja) => {
          const activo = activos.find((t) => t.ID_CAJA === caja.ID_CAJA);
          return <tr key={caja.ID_CAJA}>
            <td>{caja.NOMBRE_CAJA}</td><td>{caja.UBICACION || "—"}</td>
            <td><EtiquetaEstado tono={caja.ESTADO_OPERATIVO === "S" ? "exito" : "neutro"}>{caja.ESTADO_OPERATIVO === "S" ? "Operativa" : "Fuera de servicio"}</EtiquetaEstado></td>
            <td>{activo ? <button type="button" onClick={() => verTurno(activo.ID_TURNO_CAJA)}>#{activo.ID_TURNO_CAJA}</button> : "—"}</td>
            <td><button type="button" onClick={() => { setFiltro(String(caja.ID_CAJA)); setPagina(1); setVista("historial"); }}>{caja.TOTAL_TURNOS}</button></td>
            {dueno && <td className="caja-acciones">
              <button type="button" disabled={ocupado} onClick={() => setFormulario({
                id: caja.ID_CAJA, nombre: caja.NOMBRE_CAJA, ubicacion: caja.UBICACION ?? "", estado: caja.ESTADO_OPERATIVO
              })}>Editar</button>
              {caja.TOTAL_TURNOS === 0 && <button className="peligro" type="button" disabled={ocupado} onClick={() => eliminar(caja)}>Eliminar</button>}
            </td>}
          </tr>;
        })}</tbody>
      </table></div>}
      {formulario && dueno && <form className="formulario-producto" onSubmit={guardar}>
        <h3>{formulario.id ? "Editar caja" : "Nueva caja"}</h3>
        <fieldset className="campos-producto caja-campos" disabled={ocupado}>
          <label>Nombre<input name="nombre" required maxLength={50} value={formulario.nombre} onChange={cambiarCaja} /></label>
          <label>Ubicación<input name="ubicacion" maxLength={100} value={formulario.ubicacion} onChange={cambiarCaja} /></label>
          <label>Estado<select name="estado" value={formulario.estado} onChange={cambiarCaja}>
            <option value="S">Operativa</option><option value="N">Fuera de servicio</option>
          </select></label>
          <div className="caja-acciones">
            <button className="secundario" type="button" onClick={() => setFormulario(null)}>Cancelar</button>
            <button type="submit">Guardar caja</button>
          </div>
        </fieldset>
      </form>}
    </section>
    <div id="caja-turno" className="modulo-pila" hidden={vista !== "turno"}>
    <section className="panel">
      <h2>Turnos activos</h2>
      {catalogo?.datos && (activos.length ? <ul className="caja-lista">{activos.map((turno) =>
        <li key={turno.ID_TURNO_CAJA}>
          <button type="button" onClick={() => verTurno(turno.ID_TURNO_CAJA)}>{turno.NOMBRE_CAJA} · #{turno.ID_TURNO_CAJA}</button>
          <span>{turno.RESPONSABLE_APERTURA} · {turno.APERTURA} · Efectivo inicial {dinero(turno.INICIAL_EFECTIVO)}</span>
        </li>
      )}</ul> : <div className="modulo-vacio"><p>No hay turnos abiertos.</p>{disponibles.length > 0 && <a href="#caja-apertura">Ir al formulario de apertura</a>}</div>)}
    </section>
    <section className="panel" id="caja-apertura">
      <h2>Abrir turno</h2>
      <p className="modulo-ayuda">Selecciona una terminal e indica cuánto efectivo hay al iniciar el turno.</p>
      <EstadoConsulta consulta={catalogo} texto="Consultando cajas…" />
      {catalogo?.datos && (disponibles.length ? <form onSubmit={abrir}>
        <fieldset className="campos-producto caja-campos" disabled={ocupado}>
          <label>Caja<select required value={seleccion?.ID_CAJA ?? ""} onChange={(evento) => setCajaId(evento.target.value)}>
            <option value="">Selecciona una caja</option>
            {disponibles.map((caja) => <option key={caja.ID_CAJA} value={caja.ID_CAJA}>{caja.NOMBRE_CAJA}</option>)}
          </select></label>
          <label>Efectivo inicial<input type="number" required min="0" max="999999999999.99" step="0.01"
            value={inicial} onChange={(evento) => setInicial(evento.target.value)} /></label>
          <div><button type="submit">Abrir turno</button></div>
        </fieldset>
      </form> : <p>No hay cajas operativas sin turno abierto.</p>)}
    </section>
    </div>
    <section id="caja-historial" className="panel" hidden={vista !== "historial"}>
      <h2>Historial de turnos cerrados</h2>
      <div className="campos-producto caja-campos"><label>Caja
        <select value={filtro} onChange={(evento) => { setFiltro(evento.target.value); setPagina(1); }}>
          <option value="">Todas</option>
          {cajas.map((caja) => <option key={caja.ID_CAJA} value={caja.ID_CAJA}>{caja.NOMBRE_CAJA}</option>)}
        </select>
      </label></div>
      <EstadoConsulta consulta={historial} texto="Consultando historial…" />
      {historial?.datos?.turnos.length === 0 && <p className="modulo-vacio">No hay turnos cerrados para este filtro.</p>}
      {historial?.datos?.turnos.length > 0 && <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Turnos cerrados"><table aria-label="Turnos cerrados">
        <thead><tr><th>Turno</th><th>Caja</th><th>Apertura</th><th>Cierre</th><th>Estado</th><th>Efectivo inicial</th><th>Detalle</th></tr></thead>
        <tbody>{historial.datos.turnos.map((turno) => <tr key={turno.ID_TURNO_CAJA}>
          <td>{turno.ID_TURNO_CAJA}</td><td>{turno.NOMBRE_CAJA}</td>
          <td>{turno.APERTURA}<br />{turno.RESPONSABLE_APERTURA}</td><td>{turno.CIERRE}<br />{turno.RESPONSABLE_CIERRE}</td>
          <td><EtiquetaEstado tono="neutro">{turno.ESTADO_TURNO}</EtiquetaEstado></td><td className="modulo-numero">{dinero(turno.INICIAL_EFECTIVO)}</td>
          <td><button type="button" onClick={() => verTurno(turno.ID_TURNO_CAJA, "historial")}>Ver turno</button></td>
        </tr>)}</tbody>
      </table></div>}
      <Paginacion pagina={pagina} hayMas={historial?.datos?.hayMas} cambiar={setPagina} />
    </section>
    {turnoId !== null && <section className="panel caja-detalle" hidden={vista !== vistaDetalle}>
      <div className="panel-encabezado">
        <h2>{detalle?.datos?.turno.NOMBRE_CAJA ?? "Turno"} #{turnoId} {detalle?.datos && `· ${detalle.datos.turno.ESTADO_TURNO}`}</h2>
        <button type="button" onClick={() => verTurno(null)}>Ocultar detalle</button>
      </div>
      <EstadoConsulta consulta={detalle} texto="Consultando turno…" />
      {detalle?.datos && <TurnoDetalle key={turnoId} datos={detalle.datos} ocupado={ocupado} cerrarTurno={cerrar} />}
      <Paginacion pagina={paginaVentas} hayMas={detalle?.datos?.hayMas} cambiar={setPaginaVentas} />
    </section>}
  </div>;
}
