import { useEffect, useState } from "react";
import { Icono } from "./Navegacion.jsx";
import { TarjetaDato } from "./Presentacion.jsx";
import "./Inicio.css";

const moneda = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 2 });
const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "full", timeZone: "America/Santiago" });
const iconos = {
  ventas: "M4 20h16 M7 16v-4 M12 16V8 M17 16V4",
  registros: "M4 12l8-8h7v7l-8 8z M15 8h.01",
  stock: "M12 3l8 5v8l-8 5-8-5V8z M4 8l8 5 8-5 M12 13v8",
  alerta: "M10.3 4.5a2 2 0 0 1 3.4 0l7.2 12.4a2 2 0 0 1-1.7 3.1H4.8a2 2 0 0 1-1.7-3.1z M12 9v4 M12 16h.01",
  caja: "M4 18h16v3H4z M5 18l2-9h10l2 9 M9 9V5h6v4 M8 14h8",
  nueva: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M8 12h8 M12 8v8",
  flecha: "m9 6 6 6-6 6",
  recargar: "M20 10a8 8 0 0 0-14-4l-2 2 M4 3v5h5 M4 14a8 8 0 0 0 14 4l2-2 M20 21v-5h-5"
};
export default function Inicio({ usuario, seleccionar, abastecer, verInsumo }) {
  const dueno = usuario.rol === "DUENO";
  const [intento, actualizar] = useState(0);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    const controlador = new AbortController();
    fetch("/api/inicio", { signal: controlador.signal }).then(async (respuesta) => {
      if (!respuesta.ok) throw new Error("No se pudo consultar Inicio. Comprueba la conexión y tu sesión.");
      return respuesta.json();
    }).then((datos) => {
      if (!controlador.signal.aborted) setResultado({ datos });
    }).catch((error) => {
      if (!controlador.signal.aborted) setResultado({
        error: error instanceof TypeError ? "No hay conexión con el servidor. Vuelve a intentar." : error.message
      });
    });
    return () => controlador.abort();
  }, [intento]);

  const datos = resultado?.datos;
  const cargando = !resultado;
  const stockCompleto = Boolean(datos?.alertas && datos?.alertasInsumos);
  const incompleto = datos && (!datos.ventas || !datos.turnos || (dueno && !stockCompleto));
  const alertas = [
    ...(datos?.alertas ?? []).map((a) => ({ ...a, id: a.ID_PRODUCTO, nombre: a.NOMBRE_PRODUCTO, tipo: "Producto" })),
    ...(datos?.alertasInsumos ?? []).map((a) => ({ ...a, id: a.ID_INSUMO, nombre: a.NOMBRE_INSUMO, tipo: "Insumo" }))
  ];
  const dia = datos ? new Date(datos.hoy + "T12:00:00Z") : new Date();

  return <div className="inicio" aria-busy={cargando}>
    <header className="inicio-portada">
      <div>
        <p className="inicio-marca">SABOTINO PASTELERÍA</p>
        <h1><span className="inicio-icono"><Icono trazado="M3 10l9-7 9 7v10H3z M9 20v-7h6v7" /></span>Inicio</h1>
        <p className="inicio-saludo">Hola, {usuario.nombre}</p>
        <time dateTime={datos?.hoy}>{fecha.format(dia)}</time>
      </div>
      <button type="button" className="inicio-actualizar" disabled={cargando} onClick={() => {
        setResultado(null);
        actualizar(intento + 1);
      }}><Icono trazado={iconos.recargar} />{cargando ? "Consultando…" : "Actualizar Inicio"}</button>
    </header>

    {resultado?.error && <p className="error" role="alert">{resultado.error}</p>}
    {incompleto && <p className="inicio-aviso" role="status">Algunos indicadores no respondieron. Puedes volver a consultarlos con Actualizar Inicio.</p>}
    <section aria-labelledby="resumen-dia">
      <h2 id="resumen-dia" className="solo-lectores">Resumen del día</h2>
      <dl className="inicio-indicadores">
        <TarjetaDato icono={iconos.ventas} titulo={dueno ? "Ventas de hoy" : "Tus ventas de hoy"} tono="dorado" arte="cupcake-chef"
          detalle="Importe de ventas confirmadas">{cargando ? "Consultando…" : datos?.ventas ? moneda.format(datos.ventas.TOTAL) : "—"}</TarjetaDato>
        <TarjetaDato icono={iconos.registros} titulo="Ventas registradas" tono="lavanda" arte="cafe-torta"
          detalle="Ventas confirmadas hoy">{datos?.ventas?.CANTIDAD ?? "—"}</TarjetaDato>
        {dueno && <TarjetaDato icono={iconos.stock} titulo="Artículos con stock crítico" tono="verde" arte="abastecimiento"
          detalle="Productos e insumos activos en el umbral o por debajo">{stockCompleto ? alertas.length : "—"}</TarjetaDato>}
        <TarjetaDato icono={iconos.caja} titulo="Estado de caja" tono="rosa" arte="registro">
          {datos?.turnos ? <span className="caja-estado" data-abierto={datos.turnos.length > 0}>{datos.turnos.length ? "Abierta" : "Cerrada"}</span> : "—"}
        </TarjetaDato>
      </dl>
    </section>

    <div className={dueno ? "inicio-actividad inicio-actividad-dueno" : "inicio-actividad"}>
      <section className="inicio-panel inicio-panel-caja" aria-labelledby="inicio-caja">
        <h2 id="inicio-caja"><Icono trazado={iconos.caja} />Caja Principal</h2>
        {datos?.turnos?.length > 0 ? <ul className="inicio-lista">
          {datos.turnos.map((turno) => <li key={turno.ID_TURNO_CAJA}>
            <div><strong>Turno #{turno.ID_TURNO_CAJA}</strong><p>Apertura {turno.APERTURA}</p></div>
          </li>)}
        </ul> : <p>{cargando ? "Consultando turnos…" : datos?.turnos ? "No hay turnos abiertos en este momento." : "No se pudo consultar el estado de caja."}</p>}
        <button type="button" className="secundario" onClick={() => seleccionar("caja")}>
          {!dueno && datos?.turnos?.length === 0 ? "Abrir turno en Caja" : "Consultar Caja"}
        </button>
      </section>
      {dueno && <section className="inicio-panel inicio-panel-stock" aria-labelledby="inicio-stock">
        <h2 id="inicio-stock"><Icono trazado={iconos.alerta} />Alertas de stock crítico</h2>
        {alertas.length > 0 ? <ul className="inicio-lista">
          {alertas.map((articulo) => <li key={`${articulo.tipo}-${articulo.id}`}>
            <div><strong>{articulo.nombre}</strong> <span className="modulo-estado" data-tono={articulo.tipo === "Insumo" ? "acento" : "neutro"}>{articulo.tipo}</span>
              <p>Stock {articulo.STOCK_ACTUAL} {articulo.CODIGO_UNIDAD} · Stock crítico {articulo.STOCK_CRITICO} {articulo.CODIGO_UNIDAD}</p>
            </div>
            <div className="acciones-formulario">
              <button type="button" className="secundario" onClick={() => articulo.tipo === "Insumo" ? verInsumo(articulo.nombre) : seleccionar("productos")}>
                {articulo.tipo === "Insumo" ? "Ver Insumos" : "Ver Productos"}
              </button>
              {articulo.tipo === "Producto" && <button type="button" className="secundario" onClick={() => abastecer(articulo)}
                aria-label={`Abastecer ${articulo.nombre}`}>Abastecer</button>}
            </div>
          </li>)}
        </ul> : <>
          <p>{cargando ? "Consultando existencias…" : stockCompleto ? "Todos los artículos activos están por encima del umbral crítico." : "No se pudieron consultar todas las alertas."}</p>
          {stockCompleto && <span className="stock-pildora">Sin alertas de stock</span>}
        </>}
      </section>}
    </div>
  </div>;
}
