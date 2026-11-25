import { useEffect, useRef, useState } from "react";
import { Icono } from "./Navegacion.jsx";
import "./Caja.css";
import { CabeceraModulo } from "./Presentacion.jsx";
import { useBorrador } from "./borradores.js";

const simbolos = {
  candado: "M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
};


const api = "/api/caja";
const formato = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinero = (valor) => valor == null ? "—" : `$ ${formato.format(valor)}`;
const aCentavos = (valor) => Math.round(valor * 100);
const metodos = ["EFECTIVO", "TARJETA", "TRANSFERENCIA"];
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
  const [confirmar, setConfirmar] = useState(false);
  const { turno, pagos, ventas, auditoria, borradores } = datos;
  const abierto = turno.ESTADO_TURNO === "ABIERTO";
  const [conteo, setConteo, descartarConteo] = useBorrador("caja", `arqueo:${turno.ID_TURNO_CAJA}`, conteoVacio,
    (valores) => Object.values(valores).some(Boolean));
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
            turno.ID_TURNO_CAJA, Object.fromEntries(filas.map((fila) => [fila.clave, fila.real])), descartarConteo
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

export function AbrirCajaPrincipal({ alAbrir, modulo = "caja" }) {
  const [inicial, setInicial] = useBorrador(modulo, "apertura", "0", (valor) => valor !== "0");
  const [ocupado, setOcupado] = useBorrador(modulo, "envioApertura", false, () => false);
  const [error, setError] = useState("");
  const enCurso = useRef(false);

  async function abrir(evento) {
    evento.preventDefault();
    if (enCurso.current) return;
    const efectivoInicial = monto(inicial);
    if (efectivoInicial === null) return setError("Ingresa un monto inicial válido.");
    enCurso.current = true;
    setOcupado(true);
    setError("");
    try {
      await solicitar("/turnos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ efectivoInicial })
      });
      setInicial("0");
      alAbrir();
    } catch (fallo) {
      setError(fallo.estado === "ERROR" ? fallo.message : "Actualiza la pantalla para verificar si el turno se abrió.");
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  return <section className="panel caja-apertura" id="caja-apertura">
    <img className="caja-ilustracion" src="/branding/cupcake-chef.svg" alt="" width="240" height="240" />
    <form onSubmit={abrir}>
      <h2>¿Listo para comenzar?</h2>
      <p>Abre el turno de la caja principal y comienza a registrar tus ventas del día.</p>
      <div className="campos-producto">
        <label>Dinero inicial en efectivo (CLP)
          <span className="caja-importe"><span aria-hidden="true">$</span><input type="number" required min="0" max="999999999999.99" step="0.01" value={inicial}
            aria-invalid={Boolean(error && monto(inicial) === null)} aria-describedby={error ? "error-apertura" : undefined}
            onChange={(evento) => setInicial(evento.target.value)} disabled={ocupado} /></span>
        </label>
      </div>
      {error && <p id="error-apertura" role="alert" className="error">{error}</p>}
      <button type="submit" disabled={ocupado}><span><Icono trazado="m9 5 11 7-11 7z" /></span>
        {ocupado ? "Abriendo turno…" : "Abrir turno y comenzar a vender"}
      </button>
    </form>
  </section>;
}

export default function Caja({ irAVentas }) {
  const [vista, setVista] = useState("turno");
  const [revision, actualizar] = useState(0);
  const [turnoElegido, setTurnoElegido] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [paginaVentas, setPaginaVentas] = useState(1);
  const [ocupado, setOcupado] = useBorrador("caja", "envio", false, () => false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const enCurso = useRef(false);
  const catalogo = useCaja("", revision);
  const activo = catalogo?.datos?.activos[0];
  const historial = useCaja(vista === "historial" ? `/turnos?pagina=${pagina}` : null, revision);
  const turnoId = vista === "turno" ? activo?.ID_TURNO_CAJA : turnoElegido;
  const detalle = useCaja(turnoId == null ? null : `/turnos/${turnoId}?pagina=${paginaVentas}`, revision);
  const balance = detalle?.datos;
  const seleccionarTurno = (id, seccion) => {
    setTurnoElegido(id);
    setPaginaVentas(1);
    setVista(seccion);
  };

  async function cerrar(id, importes, limpiarBorrador) {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setError("");
    try {
      const { descuadre } = await solicitar(`/turnos/${id}/cierre`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(importes)
      });
      setMensaje(`Turno #${id} cerrado. Descuadre registrado: ${dinero(descuadre)}.`);
      limpiarBorrador();
      seleccionarTurno(id, "balance");
      actualizar((n) => n + 1);
    } catch (fallo) {
      setError(fallo.estado === "ERROR" ? fallo.message : "Verifica el estado del turno antes de repetir el cierre.");
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  const opciones = <div className="acciones-formulario caja-opciones">
    <button className="secundario" type="button" disabled={ocupado}
      onClick={() => seleccionarTurno(null, vista === "turno" ? "historial" : "turno")}>
      {vista === "turno" ? "Historial de turnos" : "Volver a Caja"}
    </button>
    <button className="secundario" type="button" disabled={ocupado} onClick={() => actualizar((n) => n + 1)}>Actualizar</button>
  </div>;

  return <div className="caja modulo">
    {(vista !== "turno" || !catalogo?.datos) && <CabeceraModulo modulo="caja" titulo="Caja Principal" descripcion="Apertura, ventas y cierre de jornada">
      {opciones}
    </CabeceraModulo>}
    {mensaje && <p role="status" className="mensaje-exito">{mensaje}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {vista === "turno" && <>
      <EstadoConsulta consulta={catalogo} texto="Consultando Caja Principal…" />
      {catalogo?.datos && <div className="caja-jornada">
        <div className="panel caja-operacion">
          <header className="caja-portada">
            <img className="caja-vitrina" src="/branding/vitrina.svg" alt="" width="560" height="410" />
            <div className="caja-portada-contenido">
              <div className="caja-titulo">
                <img src="/branding/registro.svg" alt="" width="120" height="120" />
                <h1>Caja<br />Principal</h1>
              </div>
              <p className="caja-lema">{activo ? "Tu jornada está en marcha" : "Tu jornada comienza aquí"}</p>
              <span className="caja-estado" data-abierto={Boolean(activo)}>
                <Icono trazado={activo ? "m5 12 5 5 9-10" : simbolos.candado} />{activo ? "Turno abierto" : "Turno cerrado"}
              </span>
            </div>
          </header>
          {activo ? <div className="caja-en-marcha">
            <h2>Turno #{activo.ID_TURNO_CAJA}</h2>
            <p>{activo.RESPONSABLE_APERTURA} · {activo.APERTURA}</p>
            <dl className="modulo-metricas"><div><dt>Efectivo inicial</dt><dd>{dinero(activo.INICIAL_EFECTIVO)}</dd></div>
              <div><dt>Ventas del turno</dt><dd>{balance?.resumen?.CANTIDAD ?? "—"}</dd></div>
              <div><dt>Total del turno</dt><dd>{dinero(balance?.resumen?.TOTAL)}</dd></div></dl>
            <EstadoConsulta consulta={detalle} texto="Consultando importes del turno…" />
            {balance?.pagos.length > 0 && <dl className="modulo-metricas">{balance.pagos.map((pago) =>
              <div key={pago.NOMBRE_METODO}><dt>{pago.NOMBRE_METODO}</dt><dd>{dinero(pago.TOTAL)}</dd></div>)}</dl>}
            <div className="acciones-formulario">
              <button type="button" onClick={irAVentas}>Ir a vender</button>
              <button className="secundario" type="button" onClick={() => seleccionarTurno(activo.ID_TURNO_CAJA, "balance")}>Cerrar turno</button>
            </div>
          </div> : catalogo.datos.caja?.ESTADO_OPERATIVO === "N"
            ? <p className="error" role="alert">La Caja Principal está fuera de servicio.</p>
            : <AbrirCajaPrincipal alAbrir={irAVentas} />}
          {opciones}
        </div>
      </div>}
    </>}
    {vista === "historial" && <section className="panel">
      <h2>Historial de turnos cerrados</h2>
      <EstadoConsulta consulta={historial} texto="Consultando historial…" />
      {historial?.datos?.turnos.length === 0 && <p className="modulo-vacio">Todavía no hay turnos cerrados.</p>}
      {historial?.datos?.turnos.length > 0 && <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Turnos cerrados">
        <table><thead><tr><th>Turno</th><th>Caja</th><th>Apertura</th><th>Cierre</th><th>Detalle</th></tr></thead>
          <tbody>{historial.datos.turnos.map((turno) => <tr key={turno.ID_TURNO_CAJA}>
            <td>#{turno.ID_TURNO_CAJA}</td><td>{turno.NOMBRE_CAJA === "MAIN" ? "Caja Principal" : turno.NOMBRE_CAJA}</td>
            <td>{turno.APERTURA}<br />{turno.RESPONSABLE_APERTURA}</td><td>{turno.CIERRE}<br />{turno.RESPONSABLE_CIERRE}</td>
            <td><button className="secundario" type="button" onClick={() => seleccionarTurno(turno.ID_TURNO_CAJA, "historial")}>Ver turno</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <Paginacion pagina={pagina} hayMas={historial?.datos?.hayMas} cambiar={setPagina} />
    </section>}
    {vista !== "turno" && turnoId != null && <section className="panel caja-detalle">
      <div className="panel-encabezado"><h2>Balance del turno #{turnoId}</h2></div>
      <EstadoConsulta consulta={detalle} texto="Consultando turno…" />
      {balance && <TurnoDetalle key={turnoId} datos={balance} ocupado={ocupado} cerrarTurno={cerrar} />}
      <Paginacion pagina={paginaVentas} hayMas={balance?.hayMas} cambiar={setPaginaVentas} />
    </section>}
  </div>;
}
