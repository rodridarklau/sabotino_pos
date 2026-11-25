
import { useEffect, useState } from "react";
import { useBorrador } from "./borradores.js";
import { buscarProveedorPropio } from "./proveedorPropio.js";
import { CabeceraModulo, TarjetaDato } from "./Presentacion.jsx";

const API = "/api/compras/proveedores";

const formularioVacio = {
  rut: "",
  razonSocial: "",
  telefono: "",
  email: ""
};

export default function Proveedores({ onVolver, inicioEnAlta = false, alCrear }) {
  const [proveedores, setProveedores] = useState([]);
  const [vinculados, setVinculados] = useState([]);
  const [proveedorVisible, setProveedorVisible] = useState(null);
  const [buscarProducto, setBuscarProducto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const contexto = inicioEnAlta ? "desde-insumos" : "general";
  const [guardando, setGuardando] = useBorrador("proveedores", `${contexto}:envio`, false, () => false);
  const [mostrarFormulario, setMostrarFormulario] = useBorrador("proveedores", `${contexto}:visible`, inicioEnAlta, () => false);
  const [idEditando, setIdEditando] = useBorrador("proveedores", `${contexto}:id`, null, () => false);
  const [formulario, setFormulario] = useBorrador("proveedores", `${contexto}:campos`, formularioVacio,
    (datos) => Object.values(datos).some(Boolean));
  const [error, setError] = useState("");
  const [erroresCampo, setErroresCampo] = useState({});
  const [mensaje, setMensaje] = useState("");

  async function consultarProveedores(signal) {
    try {
      const respuesta = await fetch(`${API}?productos=1`, { signal });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje || "No se pudieron cargar los proveedores"
        );
      }

      if (!signal?.aborted) {
        setProveedores(datos.proveedores ?? []);
        setVinculados(datos.vinculados ?? []);
      }
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

  function abrirNuevo(razonSocial = "") {
    setErroresCampo({});
    setIdEditando(null);
    setFormulario({ ...formularioVacio, razonSocial });
    setMensaje("");
    setError("");
    setMostrarFormulario(true);
  }

  function abrirEdicion(proveedor) {
    setErroresCampo({});
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
    setErroresCampo((actuales) => ({ ...actuales, [name]: "" }));

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value
    }));
  }

  async function guardarProveedor(evento) {
    evento.preventDefault();

    if (guardando) return;

    const invalidos = {};
    if (formulario.rut.trim().length < 3) invalidos.rut = "Ingresa el RUT completo.";
    if (!formulario.razonSocial.trim()) invalidos.razonSocial = "Ingresa la razón social.";
    setErroresCampo(invalidos);
    if (Object.keys(invalidos).length) return;

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
        if (respuesta.status === 409) {
          setErroresCampo({ rut: datos.mensaje || "Ya existe un proveedor con ese RUT." });
          return;
        }
        throw new Error(
          datos.mensaje || "No se pudo guardar el proveedor"
        );
      }

      // Oracle ya confirmó la operación.
      if (!editando && Number.isSafeInteger(datos.idProveedor)) alCrear?.(datos.idProveedor);
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

  const productosPorProveedor = new Map();
  for (const producto of vinculados) {
    productosPorProveedor.set(producto.ID_PROVEEDOR, (productosPorProveedor.get(producto.ID_PROVEEDOR) ?? 0) + 1);
  }

  return (
    <div className="modulo modulo-pila proveedores">
      <CabeceraModulo modulo="proveedores" titulo="Gestión de proveedores"
        descripcion="Consulta y actualiza los datos de contacto de tus proveedores.">
        <button className="secundario" type="button" onClick={onVolver}>
          {inicioEnAlta ? "← Volver al nuevo insumo" : "← Volver a productos"}
        </button>
      </CabeceraModulo>

      <dl className="resumen-modulo">
        {[["Proveedores registrados", proveedores.length, "dorado"], ["Con productos asociados", productosPorProveedor.size, "lavanda"],
          ["Productos asociados", vinculados.length, "verde"], ["Sin productos asociados", proveedores.length - productosPorProveedor.size, "rosa"]]
          .map(([titulo, valor, tono]) => <TarjetaDato key={titulo} titulo={titulo} tono={tono}
            icono="M3 5h12v12H3z M15 9h4l2 4v4h-6 M7 19h.01 M18 19h.01">{cargando || error ? "—" : valor}</TarjetaDato>)}
      </dl>
      <section className="panel">

        <div className="panel-encabezado">
          <div>
            <h2>Proveedores registrados</h2>
            <p>Total: {proveedores.length}</p>
          </div>

          <div className="acciones-usuario">
            <button type="button" onClick={() => abrirNuevo()}>
              + Nuevo proveedor
            </button>
            {!cargando && !error && !mostrarFormulario && !buscarProveedorPropio(proveedores) &&
              <button className="secundario" type="button" onClick={() => abrirNuevo("SABOTINO — Producción propia")}>
                Registrar producción propia
              </button>}

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
                RUT (obligatorio)
                <input
                  name="rut"
                  value={formulario.rut}
                  onChange={actualizarCampo}
                  maxLength={12}
                  placeholder="Ej. 12345678-5"
                  required
                  aria-invalid={Boolean(erroresCampo.rut)}
                  aria-describedby={erroresCampo.rut ? "proveedor-rut-error" : undefined}
                />
                {erroresCampo.rut && <small className="campo-error" id="proveedor-rut-error" role="alert">{erroresCampo.rut}</small>}
              </label>

              <label>
                Razón social (obligatoria)
                <input
                  name="razonSocial"
                  value={formulario.razonSocial}
                  onChange={actualizarCampo}
                  maxLength={120}
                  required
                  aria-invalid={Boolean(erroresCampo.razonSocial)}
                  aria-describedby={erroresCampo.razonSocial ? "proveedor-razon-error" : undefined}
                />
                {erroresCampo.razonSocial && <small className="campo-error" id="proveedor-razon-error" role="alert">{erroresCampo.razonSocial}</small>}
              </label>

              <label>
                Teléfono (opcional)
                <input
                  type="tel"
                  name="telefono"
                  value={formulario.telefono}
                  onChange={actualizarCampo}
                  maxLength={20}
                />
              </label>

              <label>
                Correo electrónico (opcional)
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
                disabled={guardando}
                onClick={() => {
                  setMostrarFormulario(false);
                  setFormulario(formularioVacio);
                  setIdEditando(null);
                }}
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
                <th>Productos asociados</th>
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
                  <td><span className="stock-pildora">{productosPorProveedor.get(proveedor.ID_PROVEEDOR) ?? 0}</span></td>

                  <td>
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => abrirEdicion(proveedor)}
                    >
                      Editar
                    </button>
                    <button type="button" className="secundario" aria-expanded={proveedorVisible?.ID_PROVEEDOR === proveedor.ID_PROVEEDOR}
                      onClick={() => {
                        setProveedorVisible(proveedorVisible?.ID_PROVEEDOR === proveedor.ID_PROVEEDOR ? null : proveedor);
                        setBuscarProducto("");
                      }}>Ver productos</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {proveedorVisible && <section className="formulario-producto" aria-label="Productos vinculados">
          <h3>Productos de {proveedorVisible.RAZON_SOCIAL}</h3>
          <p>Productos cuyo último abastecimiento registrado corresponde a este proveedor.</p>
          <label className="modulo-busqueda">Buscar producto
            <input className="buscador" type="search" value={buscarProducto} onChange={(e) => setBuscarProducto(e.target.value)} />
          </label>
          <ul>{vinculados.filter((p) => p.ID_PROVEEDOR === proveedorVisible.ID_PROVEEDOR &&
            p.NOMBRE_PRODUCTO.toLowerCase().includes(buscarProducto.trim().toLowerCase())).map((p) =>
            <li key={p.ID_PRODUCTO}>{p.NOMBRE_PRODUCTO}</li>)}</ul>
          {!vinculados.some((p) => p.ID_PROVEEDOR === proveedorVisible.ID_PROVEEDOR &&
            p.NOMBRE_PRODUCTO.toLowerCase().includes(buscarProducto.trim().toLowerCase())) && <p>No hay productos que coincidan.</p>}
        </section>}

        {cargando && <p className="modulo-vacio" role="status">Consultando proveedores…</p>}
        {!cargando && !error && proveedoresFiltrados.length === 0 && (
          <div className="modulo-vacio">
            <h3>{proveedores.length ? "No encontramos proveedores con esa búsqueda" : "Todavía no hay proveedores registrados"}</h3>
            {proveedores.length > 0 && <button className="secundario" type="button" onClick={() => setBusqueda("")}>Limpiar búsqueda</button>}
            {proveedores.length === 0 && !mostrarFormulario && <button type="button" onClick={() => abrirNuevo()}>Registrar primer proveedor</button>}
          </div>
        )}
        <aside className="proveedores-relacion">
          <h3>Relación con productos</h3>
          <p>El vínculo corresponde al último abastecimiento real de cada producto.</p>
        </aside>
      </section>
    </div>
  );
}
