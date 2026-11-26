import { useEffect, useRef, useState } from "react";
import { CabeceraModulo, PestanasModulo } from "./Presentacion.jsx";
import { useBorrador } from "./borradores.js";

const api = "/api/mantenedores";
const estados = [["S", "Sí"], ["N", "No"]];
const catalogos = {
  terminales: {
    titulo: "Terminales de caja", id: "ID_CAJA",
    campos: [
      { clave: "nombre", columna: "NOMBRE_CAJA", titulo: "Nombre", maximo: 50 },
      { clave: "ubicacion", columna: "UBICACION", titulo: "Ubicación", maximo: 100, opcional: true },
      { clave: "estado", columna: "ESTADO_OPERATIVO", titulo: "Operativa", opciones: estados }
    ]
  },
  categorias: {
    titulo: "Categorías", id: "ID_CATEGORIA",
    campos: [
      { clave: "nombre", columna: "NOMBRE_CATEGORIA", titulo: "Nombre", maximo: 50 },
      { clave: "descripcion", columna: "DESCRIPCION_CATEGORIA", titulo: "Descripción", maximo: 200, opcional: true }
    ]
  },
  unidades: {
    titulo: "Unidades de medida", id: "ID_UNIDAD",
    campos: [
      { clave: "codigo", columna: "CODIGO_UNIDAD", titulo: "Código", maximo: 10 },
      { clave: "nombre", columna: "NOMBRE_UNIDAD", titulo: "Nombre", maximo: 50 },
      { clave: "decimales", columna: "PERMITE_DECIMALES", titulo: "Permite decimales", opciones: estados }
    ]
  },
  marcas: {
    titulo: "Marcas", id: "ID_MARCA",
    campos: [
      { clave: "nombre", columna: "NOMBRE_MARCA", titulo: "Nombre", maximo: 80 },
      { clave: "origen", columna: "ORIGEN_ELABORACION", titulo: "Origen de elaboración", maximo: 50 }
    ]
  },
  "tipos-ajuste": {
    titulo: "Tipos de ajuste", id: "ID_TIPO_AJUSTE",
    campos: [
      { clave: "nombre", columna: "NOMBRE_TIPO_AJUSTE", titulo: "Nombre", maximo: 60 },
      { clave: "factor", columna: "FACTOR_OPERACION", titulo: "Movimiento", opciones: [[1, "Añade stock"], [-1, "Quita stock"]] }
    ]
  }
};

const pestanas = Object.entries(catalogos).map(([id, { titulo }]) => [id, titulo]);

export default function Mantenedores() {
  const [entidad, setEntidad] = useBorrador("mantenedores", "entidad", "terminales", () => false);
  const [formulario, setFormulario] = useBorrador("mantenedores", "formulario", null);
  const [guardando, setGuardando] = useBorrador("mantenedores", "envio", false, () => false);
  const [listado, setListado] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const enCurso = useRef(false);
  const { titulo, id, campos } = catalogos[entidad];
  const ruta = `${api}/${entidad}`;
  const cargando = listado?.revision !== revision || listado?.entidad !== entidad;
  const bloqueado = guardando || cargando;

  useEffect(() => {
    const control = new AbortController();
    fetch(ruta, { signal: control.signal }).then(async (respuesta) => {
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.mensaje);
      if (!control.signal.aborted) setListado({ entidad, revision, registros: datos.registros });
    }).catch((fallo) => {
      if (!control.signal.aborted) setListado({ entidad, revision, error: fallo.message });
    });
    return () => control.abort();
  }, [ruta, entidad, revision]);

  function abrirFormulario(fila) {
    setError("");
    setMensaje("");
    setFormulario({
      id: fila?.[id],
      principal: fila?.NOMBRE_CAJA === "MAIN",
      campos: Object.fromEntries(campos.map(({ clave, columna, opciones }) =>
        [clave, fila?.NOMBRE_CAJA === "MAIN" && clave === "estado" ? "S" : fila?.[columna] ?? opciones?.[0][0] ?? ""]))
    });
  }

  async function mutar(metodo, destino, datos) {
    if (enCurso.current) return;
    enCurso.current = true;
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const respuesta = await fetch(destino, {
        method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos)
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok) {
        setError(resultado.mensaje);
        if (resultado.estado === "INCIERTO") setRevision((n) => n + 1);
        return;
      }
      setFormulario(null);
      setMensaje(metodo === "DELETE" ? "Registro eliminado." : "Registro guardado.");
      setRevision((n) => n + 1);
    } catch {
      setError("No se pudo confirmar la operación. Revisa el listado antes de volver a intentarlo.");
      setRevision((n) => n + 1);
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  }

  return <div className="modulo modulo-pila">
    <CabeceraModulo modulo="mantenedores" titulo="Catálogos y terminales" />
    <PestanasModulo etiqueta="Mantenedores" panel="registros-mantenedor" opciones={pestanas} activa={entidad}
      seleccionar={(opcion) => {
        if (guardando || opcion === entidad || (formulario && !window.confirm("¿Descartar el formulario abierto?"))) return;
        setEntidad(opcion);
        setFormulario(null);
        setError("");
        setMensaje("");
      }} />

    <section className="panel" id="registros-mantenedor" aria-label={titulo}>
      <div className="panel-encabezado"><h2>{titulo}</h2>
        <div className="acciones-formulario">
          <button className="secundario" type="button" disabled={bloqueado} onClick={() => setRevision((n) => n + 1)}>Actualizar</button>
          <button type="button" disabled={bloqueado || Boolean(listado?.error)} onClick={() => abrirFormulario()}>Nuevo registro</button>
        </div>
      </div>
      {entidad === "terminales" && <p className="modulo-ayuda">
        Caja crea MAIN al abrir el primer turno. Aquí puedes editar su ubicación y administrar las terminales adicionales.
      </p>}
      {mensaje && <p role="status" className="mensaje-exito">{mensaje}</p>}
      {(error || (!cargando && listado?.error)) && <p role="alert" className="error">{error || listado.error}</p>}
      {cargando && <p role="status">Consultando registros…</p>}
      {!cargando && listado?.registros?.length === 0 && <p className="modulo-vacio">Todavía no hay registros.</p>}

      {formulario && <form className="formulario-producto" onSubmit={(evento) => {
        evento.preventDefault();
        const editando = formulario.id !== undefined;
        void mutar(editando ? "PUT" : "POST", editando ? `${ruta}/${formulario.id}` : ruta, formulario.campos);
      }}>
        <h3>{formulario.id === undefined ? "Nuevo registro" : "Editar registro"}</h3>
        <fieldset className="campos-producto modulo-grupo" disabled={bloqueado}>
          {campos.map(({ clave, titulo: etiqueta, opciones, maximo, opcional }) => {
            const valor = formulario.campos[clave];
            const fijo = formulario.principal && (clave === "nombre" || clave === "estado");
            const cambiar = (evento) => {
              const entrada = evento.target.value;
              const valor = opciones ? opciones.find(([id]) => String(id) === entrada)[0] : entrada;
              setFormulario({ ...formulario, campos: { ...formulario.campos, [clave]: valor } });
            };
            return <label key={clave}>{etiqueta}
              {opciones ? <select name={clave} value={valor} disabled={fijo} onChange={cambiar}>
                {opciones.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
              </select> : <input name={clave} required={!opcional} maxLength={maximo} readOnly={fijo} value={valor} onChange={cambiar} />}
            </label>;
          })}
          <div className="acciones-formulario">
            <button type="submit">Guardar registro</button>
            <button className="secundario" type="button" onClick={() => setFormulario(null)}>Cancelar</button>
          </div>
        </fieldset>
      </form>}

      {!cargando && listado?.registros?.length > 0 &&
        <div className="tabla-contenedor" tabIndex={0} role="region" aria-label={titulo}>
          <table aria-label={titulo}>
            <thead><tr>{campos.map(({ clave, titulo }) => <th key={clave}>{titulo}</th>)}<th>Acciones</th></tr></thead>
            <tbody>{listado.registros.map((fila) => <tr key={fila[id]}>
              {campos.map(({ clave, columna, opciones }) =>
                <td key={clave}>{opciones?.find(([valor]) => valor === fila[columna])?.[1] ?? fila[columna] ?? "—"}</td>)}
              <td><div className="acciones-formulario">
                <button className="secundario" type="button" disabled={bloqueado} onClick={() => abrirFormulario(fila)}>Editar</button>
                <button className="peligro" type="button" disabled={bloqueado || fila.NOMBRE_CAJA === "MAIN"} onClick={() => {
                  const nombre = campos.find(({ clave }) => clave === "nombre").columna;
                  if (window.confirm(`¿Eliminar "${fila[nombre]}"?`)) void mutar("DELETE", `${ruta}/${fila[id]}`);
                }}>Eliminar</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  </div>;
}
