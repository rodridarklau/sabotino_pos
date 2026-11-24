import { useEffect, useRef, useState } from "react";

import { grupos } from "./menu.js";
export function Icono({ trazado }) {
  return <svg className="icono-menu" viewBox="0 0 24 24" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
    <path d={trazado} />
  </svg>;
}

export function Navegacion({ vista, usuario, seleccionar, salir }) {
  const [abierto, abrir] = useState(false);
  const control = useRef(null);

  useEffect(() => {
    const pantalla = window.matchMedia("(max-width: 1220px)");
    function cerrarAlCambiar() { abrir(false); }
    pantalla.addEventListener("change", cerrarAlCambiar);
    return () => pantalla.removeEventListener("change", cerrarAlCambiar);
  }, []);

  return <header className="barra-principal" onKeyDown={(evento) => {
    if (abierto && evento.key === "Escape") {
      abrir(false);
      control.current?.focus();
    }
  }}>
    <div className="marca">
      <img src="/branding/logo-sabotino.png" width="48" height="48" alt="SABOTINO Pastelería" />

      <button ref={control} className="menu-control secundario" type="button" aria-expanded={abierto}
        aria-controls="menu-modulos" onClick={() => abrir(!abierto)}>
        <Icono trazado={abierto ? "M5 5l14 14 M19 5L5 19" : "M4 6h16 M4 12h16 M4 18h16"} />
        Menú
      </button>
    </div>
    <nav id="menu-modulos" className={abierto ? "menu menu-abierto" : "menu"} aria-label="Módulos">
      {grupos.map(([nombre, opciones]) => {
        const visibles = opciones.filter(([, , , dueno]) => !dueno || usuario.rol === "DUENO");
        return visibles.length > 0 && <div className="menu-grupo" key={nombre} role="group" aria-label={nombre}>
          <span className="menu-titulo" aria-hidden="true">{nombre}</span>
          {visibles.map(([id, titulo, trazado]) => <button className="menu-item" type="button" key={id}
            aria-current={vista === id ? "page" : undefined} onClick={() => { abrir(false); seleccionar(id); }}>
            <Icono trazado={trazado} />{titulo}
          </button>)}
        </div>;
      })}
    </nav>
    <div className="barra-usuario">
      <div className="perfil">
        <span className="perfil-inicial" aria-hidden="true">{usuario.nombre?.trim().slice(0, 1) || "S"}</span>
        <div><strong title={usuario.nombre}>{usuario.nombre}</strong><span>{usuario.rol === "DUENO" ? "Dueño" : "Vendedor"}</span></div>
      </div>
      <button type="button" className="secundario" onClick={salir}>
        <Icono trazado="M10 17l5-5-5-5 M15 12H3 M14 4h6v16h-6" />Cerrar sesión
      </button>
    </div>
  </header>;
}

