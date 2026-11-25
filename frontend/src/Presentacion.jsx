import { Icono } from "./Navegacion.jsx";
import { grupos } from "./menu.js";
import "./Presentacion.css";

const ilustraciones = { productos: "cafe-torta", insumos: "ingredientes", inventario: "ingredientes",
  compras: "abastecimiento", proveedores: "ingredientes", vendedores: "horarios", reportes: "estadisticas", ventas: "vitrina" };

export function CabeceraModulo({ modulo, titulo, descripcion, children }) {
  const trazado = grupos.flatMap(([, opciones]) => opciones).find(([id]) => id === modulo)?.[2];
  const ilustracion = ilustraciones[modulo];
  return <header className={`encabezado modulo-cabecera${ilustracion ? " cabecera-ilustrada" : ""}`}>
    <div className="modulo-identidad">
      {trazado && <span className="modulo-icono"><Icono trazado={trazado} /></span>}
      <div>{ilustracion && <small>SABOTINO PASTELERÍA</small>}<h1>{titulo}</h1><p>{descripcion}</p></div>
    </div>
    {children}
    {ilustracion && <img src={`/branding/${ilustracion}.svg`} alt="" className="cabecera-arte" />}
  </header>;
}

export function PestanasModulo({ etiqueta, prefijo, panel, opciones, activa, seleccionar }) {
  return <div className="modulo-pestanas" role="group" aria-label={etiqueta}>
    {opciones.map(([id, nombre]) => <button key={id} type="button"
      aria-pressed={activa === id} aria-controls={panel ?? `${prefijo}-${id}`}
      onClick={() => seleccionar(id)}>{nombre}</button>)}
  </div>;
}

export function EtiquetaEstado({ tono, children }) {
  return <span className="modulo-estado" data-tono={tono}>{children}</span>;
}

export function TarjetaDato({ titulo, tono, icono, arte, detalle, children }) {
  return <div className="tarjeta-dato" data-tono={tono}>
    <span className="tarjeta-dato-icono"><Icono trazado={icono} /></span>
    <dt>{titulo}</dt><dd>{children}</dd>
    {detalle && <dd className="tarjeta-dato-detalle">{detalle}</dd>}
    {arte && <img src={`/branding/${arte}.svg`} alt="" className="tarjeta-dato-arte" />}
  </div>;
}
