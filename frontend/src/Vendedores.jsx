import { useEffect, useRef, useState } from "react";

import { CabeceraModulo, EtiquetaEstado } from "./Presentacion.jsx";

const api = "/api/vendedores";
const dias = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
const usuarioNuevo = { rut: "", nombre: "", usuario: "", password: "", estado: "S" };
const horarioNuevo = { cajaId: "", dia: "LUNES", inicio: "", fin: "", estado: "S" };

export default function Vendedores() {
  const [datos, setDatos] = useState(null);
  const [revision, setRevision] = useState(0);
  const [buscar, setBuscar] = useState("");
  const [seleccion, setSeleccion] = useState(null);
  const [cuenta, setCuenta] = useState(null);
  const [horario, setHorario] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    const c = new AbortController();
    fetch(api, { signal: c.signal }).then(async (respuesta) => {
      const resultado = await respuesta.json();
      if (!respuesta.ok) throw new Error(resultado.mensaje);
      if (!c.signal.aborted) setDatos({ revision, ...resultado });
    }).catch((fallo) => {
      if (!c.signal.aborted) setDatos({ revision, error: fallo.message });
    });
    return () => c.abort();
  }, [revision]);

  const { vendedores = [], horarios = [], cajas = [] } = datos ?? {};
  const activo = vendedores.find((v) => v.ID_USUARIO === seleccion);
  const texto = buscar.trim().toLocaleLowerCase();
  const visibles = vendedores.filter((v) => [v.NOMBRE_COMPLETO, v.USERNAME, v.RUT_USUARIO]
    .some((s) => s.toLocaleLowerCase().includes(texto)));
  const horariosActivos = new Set(horarios.filter((h) => h.ESTADO_ACTIVO === "S").map((h) => h.ID_USUARIO));
  const asignaciones = horarios.filter((h) => h.ID_USUARIO === seleccion)
    .sort((a, b) => dias.indexOf(a.DIA_SEMANA) - dias.indexOf(b.DIA_SEMANA) || a.HORA_INICIO.localeCompare(b.HORA_INICIO));
  const bloqueado = ocupado || datos?.revision !== revision;

  async function guardar(ruta, metodo, cuerpo, despues) {
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setMensaje("");
    setError("");
    try {
      const r = await fetch(api + ruta, {
        method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.mensaje || "No se pudo guardar");
        if (d.estado === "INCIERTO") setRevision((n) => n + 1);
        return;
      }
      despues(d);
      setMensaje("Cambios guardados.");
      setRevision((n) => n + 1);
    } catch {
      setError("No se pudo confirmar el resultado. Revisa los datos antes de repetir.");
      setRevision((n) => n + 1);
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }

  function editar(v) {
    setCuenta({ id: v.ID_USUARIO, rut: v.RUT_USUARIO, nombre: v.NOMBRE_COMPLETO,
      usuario: v.USERNAME, password: "", estado: v.ESTADO_USUARIO });
  }

  function guardarCuenta(e) {
    e.preventDefault();
    const { id, ...cuerpo } = cuenta;
    const bytes = new TextEncoder();
    if ([["rut", 3, 12], ["nombre", 3, 100], ["usuario", 3, 50]].some(([campo, min, max]) =>
      cuerpo[campo].trim().length < min || bytes.encode(cuerpo[campo].trim()).length > max)) {
      return setError("Revisa el nombre, RUT y usuario.");
    }
    void guardar(id ? `/${id}` : "", id ? "PUT" : "POST", cuerpo, (d) => { setCuenta(null); setSeleccion(d.id); });
  }

  function guardarHorario(e) {
    e.preventDefault();
    const { id, ...cuerpo } = horario;
    if (!seleccion || cuerpo.fin <= cuerpo.inicio) return setError("La hora de fin debe ser posterior a la de inicio.");
    void guardar(id ? `/horarios/${id}` : "/horarios", id ? "PUT" : "POST",
      { ...cuerpo, vendedorId: seleccion, cajaId: Number(cuerpo.cajaId) }, () => setHorario(null));
  }

  return <div className="caja modulo vendedores">
    <CabeceraModulo modulo="vendedores" titulo="Vendedores y horarios" descripcion="Gestiona las cuentas del equipo y sus asignaciones por día.">
      <button className="secundario" type="button" disabled={ocupado} onClick={() => setRevision((n) => n + 1)}>Actualizar</button>
    </CabeceraModulo>
    {mensaje && <p className="mensaje-exito" role="status">{mensaje}</p>}
    {(error || datos?.error) && <p className="error" role="alert">{error || datos.error}</p>}
    <section className="panel">
      <div className="panel-encabezado"><h2>Cuentas de vendedores</h2>
        <button type="button" disabled={bloqueado} onClick={() => setCuenta(usuarioNuevo)}>Nuevo vendedor</button>
      </div>
      <label className="modulo-busqueda">Buscar vendedor
        <input className="buscador" placeholder="Nombre, RUT o usuario"
          type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </label>
      {datos?.revision !== revision && <p role="status">Consultando vendedores…</p>}
      <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Cuentas de vendedores"><table aria-label="Vendedores">
        <thead><tr><th>Nombre</th><th>RUT</th><th>Usuario</th><th>Estado</th><th>Horarios</th><th>Acciones</th></tr></thead>
        <tbody>{visibles.map((v) => <tr key={v.ID_USUARIO}>
          <td>{v.NOMBRE_COMPLETO}</td><td>{v.RUT_USUARIO}</td><td>{v.USERNAME}</td>
          <td><EtiquetaEstado tono={v.ESTADO_USUARIO === "S" ? "exito" : "neutro"}>{v.ESTADO_USUARIO === "S" ? "Activo" : "Inactivo"}</EtiquetaEstado></td>
          <td>{horariosActivos.has(v.ID_USUARIO) ? "Con horario activo" : "Sin horario activo"}</td>
          <td><div className="caja-acciones">
            <button type="button" disabled={bloqueado} onClick={() => editar(v)}>Editar</button>
            <button type="button" disabled={bloqueado} onClick={() => { setSeleccion(v.ID_USUARIO); setHorario(null); }}>Ver horarios</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!bloqueado && !visibles.length && !datos?.error && <p className="modulo-vacio">No hay vendedores para esta búsqueda.</p>}
      {cuenta && <form className="formulario-producto" onSubmit={guardarCuenta}>
        <h3>{cuenta.id ? "Editar vendedor" : "Registrar vendedor"}</h3>
        <fieldset className="campos-producto caja-campos" disabled={bloqueado}>
          {[["nombre", "Nombre completo", 100], ["rut", "RUT", 12], ["usuario", "Nombre de usuario", 50]].map(([campo, etiqueta, max]) =>
            <label key={campo}>{etiqueta}<input required minLength={3} maxLength={max} value={cuenta[campo]}
              onChange={(e) => setCuenta({ ...cuenta, [campo]: e.target.value })} /></label>)}
          <label>{cuenta.id ? "Nueva contraseña (opcional)" : "Contraseña inicial"}
            <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required={!cuenta.id}
              value={cuenta.password} onChange={(e) => setCuenta({ ...cuenta, password: e.target.value })} />
          </label>
          <label>Estado<select value={cuenta.estado} onChange={(e) => setCuenta({ ...cuenta, estado: e.target.value })}>
            <option value="S">Activo</option><option value="N">Inactivo</option>
          </select></label>
          <div className="caja-acciones"><button className="secundario" type="button" onClick={() => setCuenta(null)}>Cancelar</button><button>Guardar vendedor</button></div>
        </fieldset>
      </form>}
    </section>
    {activo && <section className="panel">
      <div className="panel-encabezado"><h2>Horarios de {activo.NOMBRE_COMPLETO}</h2>
        <button type="button" disabled={bloqueado || activo.ESTADO_USUARIO !== "S" || !cajas.length}
          onClick={() => setHorario(horarioNuevo)}>Asignar horario</button>
      </div>
      {activo.ESTADO_USUARIO !== "S" && <p>Activa la cuenta para asignar o modificar horarios.</p>}
      {!cajas.length && <p>Se necesita una caja operativa para asignar horarios.</p>}
      {!asignaciones.length && <p className="modulo-vacio">Este vendedor todavía no tiene asignaciones.</p>}
      {asignaciones.length > 0 && <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Horarios del vendedor"><table aria-label="Horarios del vendedor">
        <thead><tr><th>Día</th><th>Desde</th><th>Hasta</th><th>Caja</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{asignaciones.map((h) => <tr key={h.ID_HORARIO}>
          <td><strong>{h.DIA_SEMANA}</strong></td><td className="modulo-numero">{h.HORA_INICIO}</td><td className="modulo-numero">{h.HORA_FIN}</td><td>{h.NOMBRE_CAJA}</td>
          <td><EtiquetaEstado tono={h.ESTADO_ACTIVO === "S" ? "exito" : "neutro"}>{h.ESTADO_ACTIVO === "S" ? "Activo" : "Inactivo"}</EtiquetaEstado></td>
          <td><div className="caja-acciones">
            <button type="button" disabled={bloqueado || activo.ESTADO_USUARIO !== "S"} onClick={() => setHorario({
              id: h.ID_HORARIO, cajaId: h.ID_CAJA, dia: h.DIA_SEMANA, inicio: h.HORA_INICIO, fin: h.HORA_FIN, estado: h.ESTADO_ACTIVO
            })}>Editar</button>
            <button className="peligro" type="button" disabled={bloqueado} onClick={() => {
              if (window.confirm("¿Eliminar esta asignación de horario?")) {
                void guardar(`/horarios/${h.ID_HORARIO}`, "DELETE", {}, () => setHorario(null));
              }
            }}>Eliminar</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      {horario && <form className="formulario-producto" onSubmit={guardarHorario}>
        <h3>{horario.id ? "Editar asignación" : "Asignar horario"}</h3>
        <fieldset className="campos-producto caja-campos" disabled={bloqueado}>
          <label>Caja<select value={horario.cajaId} required onChange={(e) => setHorario({ ...horario, cajaId: e.target.value })}>
            <option value="">Selecciona una caja</option>
            {cajas.map((c) => <option key={c.ID_CAJA} value={c.ID_CAJA}>{c.NOMBRE_CAJA}</option>)}
          </select></label>
          <label>Día<select value={horario.dia} onChange={(e) => setHorario({ ...horario, dia: e.target.value })}>
            {dias.map((dia) => <option key={dia}>{dia}</option>)}
          </select></label>
          {[["inicio", "Desde"], ["fin", "Hasta"]].map(([campo, etiqueta]) => <label key={campo}>{etiqueta}
            <input type="time" required value={horario[campo]} onChange={(e) => setHorario({ ...horario, [campo]: e.target.value })} />
          </label>)}
          <label>Estado<select value={horario.estado} onChange={(e) => setHorario({ ...horario, estado: e.target.value })}>
            <option value="S">Activo</option><option value="N">Inactivo</option>
          </select></label>
          <div className="caja-acciones"><button className="secundario" type="button" onClick={() => setHorario(null)}>Cancelar</button><button>Guardar horario</button></div>
        </fieldset>
      </form>}
    </section>}
  </div>;
}
