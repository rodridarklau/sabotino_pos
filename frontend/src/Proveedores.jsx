
import { useEffect, useState } from "react";
import { CabeceraModulo } from "./Presentacion.jsx";

const API = "/api/compras/proveedores";

const formularioVacio = {
  rut: "",
  razonSocial: "",
  telefono: "",
  email: ""
};

export default function Proveedores({ onVolver }) {
  const [proveedores, setProveedores] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [idEditando, setIdEditando] = useState(null);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function consultarProveedores(signal) {
    try {
      const respuesta = await fetch(API, { signal });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje || "No se pudieron cargar los proveedores"
        );
      }

      if (!signal?.aborted) setProveedores(datos.proveedores ?? []);
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }

  function cargarProveedores() {
    setCargando(true);
    setError("");
    return consultarProveedores();
  }

  useEffect(() => {
    const control = new AbortController();
    void Promise.resolve().then(() => {
      if (!control.signal.aborted) return consultarProveedores(control.signal);
    });
    return () => control.abort();
  }, []);

  function abrirNuevo() {
    setIdEditando(null);
    setFormulario({ ...formularioVacio });
    setMensaje("");
    setError("");
    setMostrarFormulario(true);
  }

  function abrirEdicion(proveedor) {
    setIdEditando(proveedor.ID_PROVEEDOR);

    setFormulario({
      rut: proveedor.RUT_PROVEEDOR ?? "",
      razonSocial: proveedor.RAZON_SOCIAL ?? "",
      telefono: proveedor.TELEFONO ?? "",
      email: proveedor.EMAIL_CONTACTO ?? ""
    });

    setMensaje("");
    setError("");
    setMostrarFormulario(true);
  }

  function actualizarCampo(evento) {
    const { name, value } = evento.target;

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value
    }));
  }

  async function guardarProveedor(evento) {
    evento.preventDefault();

    if (guardando) return;

    setGuardando(true);
    setError("");
    setMensaje("");

    const editando = idEditando !== null;

    try {
      const respuesta = await fetch(
        editando ? `${API}/${idEditando}` : API,
        {
          method: editando ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(formulario)
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje || "No se pudo guardar el proveedor"
        );
      }

      // Oracle ya confirmó la operación.
      setMensaje(
        editando
          ? "Proveedor actualizado correctamente"
          : "Proveedor registrado correctamente"
      );

      setMostrarFormulario(false);
      setIdEditando(null);
      setFormulario({ ...formularioVacio });

      try {
        await cargarProveedores();
      } catch (errorRefresco) {
        console.error(errorRefresco);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const proveedoresFiltrados = proveedores.filter((proveedor) => {
    const texto = busqueda.toLowerCase();

    return (
      String(proveedor.RAZON_SOCIAL ?? "")
        .toLowerCase()
        .includes(texto) ||
      String(proveedor.RUT_PROVEEDOR ?? "")
        .toLowerCase()
        .includes(texto)
    );
  });

  return (
    <div className="modulo modulo-pila proveedores">
      <CabeceraModulo modulo="proveedores" titulo="Gestión de proveedores"
        descripcion="Consulta y actualiza los datos de contacto de tus proveedores.">
        <button className="secundario" type="button" onClick={onVolver}>
          ← Volver a productos
        </button>
      </CabeceraModulo>

      <section className="panel">

        <div className="panel-encabezado">
          <div>
            <h2>Proveedores registrados</h2>
            <p>Total: {proveedores.length}</p>
          </div>

          <div className="acciones-usuario">
            <button type="button" onClick={abrirNuevo}>
              + Nuevo proveedor
            </button>

            <button
              type="button"
              className="secundario"
              onClick={cargarProveedores}
              disabled={cargando}
            >
              {cargando ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {mensaje && (
          <div className="mensaje-exito" role="status">{mensaje}</div>
        )}

        {error && (
          <div className="error" role="alert">{error}</div>
        )}

        {mostrarFormulario && (
          <form
            className="formulario-producto"
            onSubmit={guardarProveedor}
          >
            <h3>
              {idEditando !== null
                ? "Editar proveedor"
                : "Registrar proveedor"}
            </h3>

            <div className="campos-producto">
              <label>
                RUT
                <input
                  name="rut"
                  value={formulario.rut}
                  onChange={actualizarCampo}
                  maxLength={12}
                  required
                />
              </label>

              <label>
                Razón social
                <input
                  name="razonSocial"
                  value={formulario.razonSocial}
                  onChange={actualizarCampo}
                  maxLength={120}
                  required
                />
              </label>

              <label>
                Teléfono
                <input
                  name="telefono"
                  value={formulario.telefono}
                  onChange={actualizarCampo}
                  maxLength={20}
                />
              </label>

              <label>
                Correo electrónico
                <input
                  type="email"
                  name="email"
                  value={formulario.email}
                  onChange={actualizarCampo}
                  maxLength={100}
                />
              </label>
            </div>

            <div className="acciones-formulario">
              <button
                type="button"
                className="secundario"
                onClick={() => setMostrarFormulario(false)}
              >
                Cancelar
              </button>

              <button type="submit" disabled={guardando}>
                {guardando
                  ? "Guardando..."
                  : "Guardar proveedor"}
              </button>
            </div>
          </form>
        )}

        <label className="modulo-busqueda">Buscar proveedores
        <input
          className="buscador"
          type="search"
          placeholder="Buscar por nombre o RUT..."
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
        </label>

        <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Proveedores">
          <table>
            <thead>
              <tr>
                <th>Razón social</th>
                <th>RUT</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {proveedoresFiltrados.map((proveedor) => (
                <tr key={proveedor.ID_PROVEEDOR}>
                  <td>{proveedor.RAZON_SOCIAL}</td>
                  <td>{proveedor.RUT_PROVEEDOR}</td>
                  <td>{proveedor.TELEFONO || "—"}</td>
                  <td>{proveedor.EMAIL_CONTACTO || "—"}</td>

                  <td>
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => abrirEdicion(proveedor)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!cargando && proveedoresFiltrados.length === 0 && (
          <div className="modulo-vacio">
            <h3>No hay proveedores para mostrar</h3>
          </div>
        )}
      </section>
    </div>
  );
}
