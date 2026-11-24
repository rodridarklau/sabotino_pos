import { Icono } from "./Navegacion.jsx";
import { grupos } from "./menu.js";
import "./Presentacion.css";

export function CabeceraModulo({ modulo, titulo, descripcion, children }) {
  const trazado = grupos.flatMap(([, opciones]) => opciones).find(([id]) => id === modulo)?.[2];
  return <header className="encabezado modulo-cabecera">
    <div className="modulo-identidad">
      {trazado && <span className="modulo-icono"><Icono trazado={trazado} /></span>}
      <div><h1>{titulo}</h1><p>{descripcion}</p></div>
    </div>
    {children}
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
