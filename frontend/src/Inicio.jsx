import { useEffect, useState } from "react";
import { Icono } from "./Navegacion.jsx";
import { grupos } from "./menu.js";
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
const acciones = [
  ["ventas", "Nueva venta"], ["caja", "Ir a Caja"], ["productos", "Catálogo de productos"],
  ["compras", "Compras", true], ["inventario", "Inventario", true], ["reportes", "Reportes", true]
];

function Indicador({ titulo, valor, cargando, detalle, icono }) {
  return <article className="inicio-tarjeta">
    <h2><span className="inicio-icono"><Icono trazado={iconos[icono]} /></span>{titulo}</h2>
    <strong>{cargando ? "Consultando…" : valor ?? "Sin información"}</strong>
    {detalle && <p>{detalle}</p>}
  </article>;
}

export default function Inicio({ usuario, seleccionar, abastecer }) {
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
  const incompleto = datos && (!datos.ventas || !datos.turnos || (dueno && !datos.alertas));
  const dia = datos ? new Date(datos.hoy + "T12:00:00Z") : new Date();

  return <div className="inicio" aria-busy={cargando}>
    <header className="inicio-portada">
      <div>
        <p className="inicio-marca">SABOTINO PASTELERÍA</p>
        <h1>Hola, {usuario.nombre}</h1>
        <time dateTime={datos?.hoy}>{fecha.format(dia)}</time>
      </div>
      <button type="button" className="inicio-actualizar" disabled={cargando} onClick={() => {
        setResultado(null);
        actualizar(intento + 1);
      }}><Icono trazado={iconos.recargar} />{cargando ? "Consultando…" : "Actualizar Inicio"}</button>
    </header>

    {resultado?.error && <p className="error" role="alert">{resultado.error}</p>}
    {incompleto && <p className="inicio-aviso" role="status">Algunos indicadores no respondieron. Puedes volver a consultarlos con Actualizar Inicio.</p>}
    <div className="inicio-indicadores">
      <Indicador icono="ventas" titulo={dueno ? "Ventas de hoy" : "Tus ventas de hoy"} cargando={cargando}
        valor={datos?.ventas && moneda.format(datos.ventas.TOTAL)} detalle="Importe de ventas confirmadas" />
      <Indicador icono="registros" titulo="Ventas registradas" cargando={cargando} valor={datos?.ventas?.CANTIDAD} detalle="Ventas confirmadas hoy" />
      {dueno && <Indicador icono="stock" titulo="Productos con stock crítico" cargando={cargando} valor={datos?.alertas?.length}
        detalle="Productos activos en el umbral o por debajo" />}
      <Indicador icono="caja" titulo={dueno ? "Estado de caja" : "Tu turno de caja"} cargando={cargando}
        valor={datos?.turnos && (datos.turnos.length ? `${datos.turnos.length} ${datos.turnos.length === 1 ? "turno abierto" : "turnos abiertos"}` : "Sin turnos abiertos")} />
    </div>

    <section className="inicio-panel" aria-labelledby="inicio-acciones">
      <h2 id="inicio-acciones">Acciones rápidas</h2>
      <div className="inicio-acciones">
        {acciones.filter(([, , soloDueno]) => !soloDueno || dueno).map(([id, titulo]) =>
          <button type="button" className={id === "ventas" ? "inicio-nueva-venta" : "secundario"} key={id} onClick={() => seleccionar(id)}>
            <Icono trazado={id === "ventas" ? iconos.nueva : (iconos[id] ?? grupos.flatMap(([, opciones]) => opciones).find(([opcion]) => opcion === id)[2])} />{titulo}<Icono trazado={iconos.flecha} />
          </button>)}
      </div>
    </section>

    <div className={dueno ? "inicio-actividad inicio-actividad-dueno" : "inicio-actividad"}>
      <section className="inicio-panel" aria-labelledby="inicio-caja">
        <h2 id="inicio-caja"><Icono trazado={iconos.caja} />{dueno ? "Turnos abiertos" : "Tus turnos abiertos"}</h2>
        {datos?.turnos?.length > 0 ? <ul className="inicio-lista">
          {datos.turnos.map((turno) => <li key={turno.ID_TURNO_CAJA}>
            <div><strong>{turno.NOMBRE_CAJA}</strong><p>Apertura {turno.APERTURA}</p></div>
          </li>)}
        </ul> : <p>{cargando ? "Consultando turnos…" : datos?.turnos ? "No hay turnos abiertos en este momento." : "No se pudo consultar el estado de caja."}</p>}
        <button type="button" className="secundario" onClick={() => seleccionar("caja")}>
          {!dueno && datos?.turnos?.length === 0 ? "Abrir turno en Caja" : "Consultar Caja"}
        </button>
      </section>
      {dueno && <section className="inicio-panel" aria-labelledby="inicio-stock">
        <h2 id="inicio-stock"><Icono trazado={iconos.alerta} />Alertas de stock crítico</h2>
        {datos?.alertas?.length > 0 ? <ul className="inicio-lista">
          {datos.alertas.map((producto) => <li key={producto.ID_PRODUCTO}>
            <div><strong>{producto.NOMBRE_PRODUCTO}</strong>
              <p>Stock {producto.STOCK_ACTUAL} {producto.CODIGO_UNIDAD} · Umbral {producto.STOCK_CRITICO} {producto.CODIGO_UNIDAD}</p>
            </div>
            <button type="button" className="secundario" onClick={() => abastecer(producto)}
              aria-label={`Abastecer ${producto.NOMBRE_PRODUCTO}`}>Abastecer</button>
          </li>)}
        </ul> : <p>{cargando ? "Consultando existencias…" : datos?.alertas ? "Todos los productos activos están por encima del umbral crítico." : "No se pudieron consultar las alertas."}</p>}
      </section>}
    </div>
  </div>;
}


