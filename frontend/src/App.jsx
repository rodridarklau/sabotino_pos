
import { useEffect, useState } from "react";
import { CabeceraModulo, EtiquetaEstado } from "./Presentacion.jsx";
import "./App.css";
import Compras from "./compras.jsx";
import Proveedores from "./Proveedores.jsx";
import Inventario from "./Inventario.jsx";
import Ventas from "./Ventas.jsx";
import Caja from "./Caja.jsx";
import Vendedores from "./Vendedores.jsx";
import Reportes from "./Reportes.jsx";
import { Navegacion } from "./Navegacion.jsx";
import Inicio from "./Inicio.jsx";
import ImagenProducto from "./ImagenProducto.jsx";

const API_URL = "/api/productos";
const API_IMAGENES = "/api/productos-imagenes";

async function guardarVisual(id, { archivo, imagen, favorito, revision }) {
  const parametros = new URLSearchParams({ favorito, revision });
  const r = await fetch(archivo ? `${API_IMAGENES}/${id}/foto?${parametros}` : `${API_IMAGENES}/${id}`, archivo
    ? { method: "POST", headers: { "Content-Type": archivo.type }, body: archivo }
    : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagen, favorito, revision }) });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.mensaje || "No se pudo guardar la imagen");
}

function useMiniaturas(activo, revision, productos) {
  const [miniaturas, setMiniaturas] = useState({});
  useEffect(() => {
    if (!activo) return;
    const controlador = new AbortController();
    fetch(API_IMAGENES, { signal: controlador.signal })
      .then((respuesta) => respuesta.ok ? respuesta.json() : {})
      .then((datos) => { if (!controlador.signal.aborted) setMiniaturas(datos); })
      .catch(() => { if (!controlador.signal.aborted) setMiniaturas({}); });
    return () => controlador.abort();
  }, [activo, revision, productos]);
  return activo ? miniaturas : {};
}

function App({ usuario, onLogout }) {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(""); 
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [catalogos, setCatalogos] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [alertas, setAlertas] = useState([]);
  const [productoEditando, setProductoEditando] = useState(null);
  const [visual, setVisual] = useState(null);
  const [revisionVisual, setRevisionVisual] = useState(0);
  const [desactivandoId, setDesactivandoId] = useState(null);
  const [vista, setVista] = useState("inicio");
  const [productoSugerido, setProductoSugerido] = useState(null);
  const [busquedaInventario, setBusquedaInventario] = useState("");
  const miniaturas = useMiniaturas(vista === "productos" && usuario.rol === "DUENO", revisionVisual, productos);

  function irACompras(producto = null) {
    if (usuario.rol !== "DUENO") return;
    setProductoSugerido(producto?.ID_PRODUCTO ?? null);
    setMostrarFormulario(false);
    setVista("compras");
  }

  function volverAProductos() {
    setVista("productos");
    setProductoSugerido(null);
    cargarProductos();
  }

  function seleccionarVista(destino) {
    document.getElementById("contenido-principal")?.focus();
    window.scrollTo(0, 0);
    if (destino === "productos") return volverAProductos();
    if (destino === "compras") return irACompras();
    if (destino === "inventario") setBusquedaInventario("");
    setVista(destino);
  }

const [nuevoProducto, setNuevoProducto] = useState({
  nombreProducto: "",
  codigoBarra: "",
  idCategoria: "",
  idMarca: "",
  idUnidad: "",
  costoProduccion: "",
  precioVenta: "",
  stockCritico: "0"
});

function actualizarProducto(evento) {
  const { name, value } = evento.target;

  setNuevoProducto((anterior) => ({
    ...anterior,
    [name]: value
  }));
}

// Cargar las opciones del formulario, sin afectar las alertas.
async function obtenerCatalogos() {
  const respuesta = await fetch("/api/catalogos");
  if (!respuesta.ok) throw new Error("No se pudieron cargar los catálogos");
  return respuesta.json();
}

async function abrirFormulario() {
  setVisual(null);
  setError("");
  setMensaje("");
  try {
    setCatalogos(await obtenerCatalogos());
    setProductoEditando(null);
    setNuevoProducto({
      nombreProducto: "", codigoBarra: "", idCategoria: "", idMarca: "",
      idUnidad: "", costoProduccion: "", precioVenta: "", stockCritico: "0"
    });
    setMostrarFormulario(true);
  } catch (err) {
    setError(err.message);
  }
}

async function abrirEdicion(producto) {
  setVisual(null);
  setError("");
  setMensaje("");
  try {
    setCatalogos(await obtenerCatalogos());
    setProductoEditando(producto);
    setNuevoProducto({
      nombreProducto: producto.NOMBRE_PRODUCTO ?? "",
      codigoBarra: producto.CODIGO_BARRA ?? "",
      idCategoria: String(producto.ID_CATEGORIA),
      idMarca: String(producto.ID_MARCA),
      idUnidad: String(producto.ID_UNIDAD),
      costoProduccion: String(producto.COSTO_PRODUCCION_ACTUAL),
      precioVenta: String(producto.PRECIO_VENTA_ACTUAL),
      stockCritico: String(producto.STOCK_CRITICO)
    });
    setMostrarFormulario(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    setError(err.message);
  }
}

async function desactivarProducto(producto) {
  if (producto.ESTADO_PRODUCTO !== "S") return;

  const confirmar = window.confirm(
    `¿Desactivar "${producto.NOMBRE_PRODUCTO}"? No se eliminará el historial, ` +
    "pero dejará de estar activo."
  );
  if (!confirmar) return;

  setDesactivandoId(producto.ID_PRODUCTO);
  setError("");
  setMensaje("");
  try {
    const respuesta = await fetch(`/api/productos/${producto.ID_PRODUCTO}`, {
      method: "DELETE"
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(datos.mensaje || "No se pudo desactivar el producto");
    }
    setMensaje(`Producto "${producto.NOMBRE_PRODUCTO}" desactivado.`);
    if (productoEditando?.ID_PRODUCTO === producto.ID_PRODUCTO) {
      setMostrarFormulario(false);
      setProductoEditando(null);
    }
    await cargarProductos();
  } catch (err) {
    setError(err.message);
  } finally {
    setDesactivandoId(null);
  }
}

async function guardarProducto(evento) {
  evento.preventDefault();
  setGuardando(true);
  setError("");
  setMensaje("");

  try {
    const editando = productoEditando !== null;
    const ruta = editando
      ? `${API_URL}/${productoEditando.ID_PRODUCTO}`
      : API_URL;

    const respuesta = await fetch(ruta, {
      method: editando ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nuevoProducto)
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(
        datos.mensaje || "No se pudo registrar el producto"
      );
    }

    let errorVisual = "";
    if (visual) {
      try {
        await guardarVisual(datos.idProducto ?? productoEditando?.ID_PRODUCTO, visual);
      } catch (error) {
        errorVisual = `El producto se guardó en Oracle. La imagen o favorito requiere volver a editar el producto. ${error.message}`;
      }
    }
    setVisual(null);
    setMensaje(editando
      ? "Producto actualizado correctamente"
      : `Producto registrado con ID ${datos.idProducto}`);
    setMostrarFormulario(false);
    setProductoEditando(null);

    setNuevoProducto({
      nombreProducto: "",
      codigoBarra: "",
      idCategoria: "",
      idMarca: "",
      idUnidad: "",
      costoProduccion: "",
      precioVenta: "",
      stockCritico: "0"
    });

    await cargarProductos();
    if (errorVisual) setError(errorVisual);

  } catch (err) {
    setError(err.message);
  } finally {
    setGuardando(false);
  }
}

async function guardarSoloImagen() {
  if (!visual || !productoEditando || guardando) return;
  setGuardando(true);
  setError("");
  try {
    await guardarVisual(productoEditando.ID_PRODUCTO, visual);
    setMensaje("Preferencias visuales guardadas.");
    setVisual(null);
    setRevisionVisual((revision) => revision + 1);
  } catch (error) {
    setError(error.message);
  } finally {
    setGuardando(false);
  }
}
  

  async function cargarProductos() {
    setCargando(true);
    setError("");

    try {
      // Actualizar productos y alertas cada vez que carga el panel,
      // al pulsar "Actualizar" o al guardar un producto nuevo.
      const [respuestaProductos, respuestaAlertas] = await Promise.all([
        fetch(API_URL),
        fetch("/api/productos/alertas-stock")
      ]);

      if (!respuestaProductos.ok || !respuestaAlertas.ok) {
        throw new Error("No se pudieron cargar los productos o las alertas");
      }

      const [datosProductos, datosAlertas] = await Promise.all([
        respuestaProductos.json(),
        respuestaAlertas.json()
      ]);

      setProductos(datosProductos.productos ?? []);
      setAlertas(datosAlertas.alertas ?? []);

      console.log("Productos cargados:", datosProductos.productos?.length ?? 0);
      console.log("Alertas detectadas:", datosAlertas.alertas?.length ?? 0);
    } catch (err) {
      console.error("Error consultando inventario:", err);
      setError("No se pudieron cargar los productos o las alertas. Revisa tu sesión y el backend.");
    } finally {
      setCargando(false);
    }
  }


  const productosFiltrados = productos.filter((producto) => {
    const texto = busqueda.toLowerCase();

    return (
      String(producto.NOMBRE_PRODUCTO ?? "")
        .toLowerCase()
        .includes(texto) ||
      String(producto.CODIGO_BARRA ?? "")
        .toLowerCase()
        .includes(texto)
    );
  });

  const stockCritico = alertas.length;

  const formatoPrecio = (valor) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(Number(valor ?? 0));

  return (
    <div className="app">
      <a className="salto-contenido" href="#contenido-principal">Saltar al contenido</a>
      <Navegacion vista={vista} usuario={usuario} seleccionar={seleccionarVista} salir={onLogout} />

      <main className="contenido" id="contenido-principal" tabIndex={-1}>
        {vista === "inicio" ? (
          <Inicio usuario={usuario} seleccionar={seleccionarVista} abastecer={irACompras} />
        ) : vista === "reportes" && usuario.rol === "DUENO" ? (
          <Reportes irACompras={(id) => irACompras({ ID_PRODUCTO: id })}
            irAInventario={(nombre) => { setBusquedaInventario(nombre); setVista("inventario"); }} />
        ) : vista === "vendedores" && usuario.rol === "DUENO" ? (
          <Vendedores />
        ) : vista === "caja" ? (
          <Caja usuario={usuario} />
        ) : vista === "ventas" ? (
          <Ventas usuario={usuario} onVentaRegistrada={cargarProductos} onIrACaja={() => setVista("caja")} />
        ) : vista === "inventario" && usuario.rol === "DUENO" ? (
          <Inventario busquedaInicial={busquedaInventario} onAjusteRegistrado={cargarProductos} />
        ) : vista === "compras" && usuario.rol === "DUENO" ? (
          <Compras
            productoInicial={productoSugerido}
            onVolver={volverAProductos}
            onCompraRegistrada={cargarProductos}
          />
        ) : vista === "proveedores" && usuario.rol === "DUENO" ? (
        <Proveedores onVolver={volverAProductos} />
      ) : (
        <div className="modulo modulo-pila productos">
        <CabeceraModulo modulo="productos" titulo="Gestión de productos" descripcion="Consulta el catálogo y supervisa el inventario." />

        <section className="estadisticas">
          <article className="estadistica">
            <p>Productos cargados</p>
            <strong>{productos.length}</strong>
            <span>Registros recibidos de Oracle</span>
          </article>

          <article className="estadistica">
            <p>Productos en stock crítico</p>
            <strong>{stockCritico}</strong>
            <span>Productos activos que requieren abastecimiento</span>
          </article>
        </section>

{alertas.length > 0 && (
  <section className="panel alertas-inventario">
    <h2>Alertas de inventario</h2>

    <p>Productos que requieren abastecimiento.</p>

    <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Alertas de stock">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Stock actual</th>
            <th>Stock crítico</th>
            <th>Situación</th>
            {usuario.rol === "DUENO" && <th>Acciones</th>}
          </tr>
        </thead>

        <tbody>
          {alertas.map((producto) => (
            <tr key={producto.ID_PRODUCTO}>
              <td>{producto.NOMBRE_PRODUCTO}</td>

              <td>
                {producto.STOCK_ACTUAL} {producto.CODIGO_UNIDAD}
              </td>

              <td>
                {producto.STOCK_CRITICO} {producto.CODIGO_UNIDAD}
              </td>

              <td>
                <strong className="stock-bajo">
                  Requiere abastecimiento
                </strong>
              </td>
              {usuario.rol === "DUENO" && (
                <td>
                  <button type="button" className="boton-abastecer"
                    onClick={() => irACompras(producto)}>
                    Abastecer
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
)}


        <section className="panel">
          <div className="panel-encabezado">
            <div>
              <h2>Catálogo de productos</h2>
              <p>Información obtenida desde la base de datos.</p>
            </div>
            {usuario.rol === "DUENO" && (
  <button type="button" onClick={abrirFormulario}>
    + Nuevo producto
  </button>
)}
            <button className="secundario" type="button" onClick={cargarProductos} disabled={cargando}>
              {cargando ? "Cargando..." : "Actualizar"}
            </button>
          </div>

{mensaje && (
  <div className="mensaje-exito" role="status">{mensaje}</div>
)}

{mostrarFormulario && catalogos && (
  <form
    className="formulario-producto"
    onSubmit={guardarProducto}
  >
    <h3>{productoEditando ? `Editar: ${productoEditando.NOMBRE_PRODUCTO}` : "Registrar nuevo producto"}</h3>
    {productoEditando && (
      <p className="nota-edicion">
        El stock actual no se edita aquí. Los cambios de unidad pueden estar
        restringidos por Oracle si existen movimientos de inventario.
      </p>
    )}

    <fieldset className="modulo-grupo campos-producto">
      <legend>Información general</legend>
      <label>
        Nombre del producto
        <input
          name="nombreProducto"
          value={nuevoProducto.nombreProducto}
          onChange={actualizarProducto}
          maxLength={100}
          required
        />
      </label>

      <label>
        Código de barras
        <input
          name="codigoBarra"
          value={nuevoProducto.codigoBarra}
          onChange={actualizarProducto}
          maxLength={50}
          required
        />
      </label>

      <label>
        Categoría
        <select
          name="idCategoria"
          value={nuevoProducto.idCategoria}
          onChange={actualizarProducto}
          required
        >
          <option value="">Seleccionar categoría</option>
          {catalogos.categorias.map((categoria) => (
            <option
              key={categoria.ID_CATEGORIA}
              value={categoria.ID_CATEGORIA}
            >
              {categoria.NOMBRE_CATEGORIA}
            </option>
          ))}
        </select>
      </label>

      <label>
        Marca
        <select
          name="idMarca"
          value={nuevoProducto.idMarca}
          onChange={actualizarProducto}
          required
        >
          <option value="">Seleccionar marca</option>
          {catalogos.marcas.map((marca) => (
            <option
              key={marca.ID_MARCA}
              value={marca.ID_MARCA}
            >
              {marca.NOMBRE_MARCA}
            </option>
          ))}
        </select>
      </label>

    </fieldset>
    <fieldset className="modulo-grupo campos-producto">
      <legend>Información comercial</legend>
      <label>
        Unidad de medida
        <select
          name="idUnidad"
          value={nuevoProducto.idUnidad}
          onChange={actualizarProducto}
          required
        >
          <option value="">Seleccionar unidad</option>
          {catalogos.unidades.map((unidad) => (
            <option
              key={unidad.ID_UNIDAD}
              value={unidad.ID_UNIDAD}
            >
              {unidad.NOMBRE_UNIDAD}
            </option>
          ))}
        </select>
      </label>

      <label>
        Costo de producción
        <input
          name="costoProduccion"
          type="number"
          min="0"
          step="0.01"
          value={nuevoProducto.costoProduccion}
          onChange={actualizarProducto}
          required
        />
      </label>

      <label>
        Precio de venta
        <input
          name="precioVenta"
          type="number"
          min="0"
          step="0.01"
          value={nuevoProducto.precioVenta}
          onChange={actualizarProducto}
          required
        />
      </label>

    </fieldset>
    <fieldset className="modulo-grupo campos-producto">
      <legend>Inventario</legend>
      <label>
        Stock crítico
        <input
          name="stockCritico"
          type="number"
          min="0"
          step={
            catalogos.unidades.find(
              (unidad) =>
                String(unidad.ID_UNIDAD) ===
                String(nuevoProducto.idUnidad)
            )?.PERMITE_DECIMALES === "S"
              ? "0.001"
              : "1"
          }
          value={nuevoProducto.stockCritico}
          onChange={actualizarProducto}
          required
        />
      </label>
    </fieldset>

    {usuario.rol === "DUENO" && <ImagenProducto key={`${productoEditando?.ID_PRODUCTO ?? "nuevo"}-${revisionVisual}`}
      id={productoEditando?.ID_PRODUCTO} nombre={nuevoProducto.nombreProducto}
      categoriaProducto={catalogos.categorias.find((c) => String(c.ID_CATEGORIA) === nuevoProducto.idCategoria)?.NOMBRE_CATEGORIA}
      cambio={visual} alCambiar={setVisual} bloqueado={guardando} guardarSoloImagen={guardarSoloImagen} />}
    <div className="acciones-formulario">
      <button
        type="button"
        className="secundario"
        onClick={() => {
          setMostrarFormulario(false);
          setProductoEditando(null);
          setError("");
        }}
      >
        Cancelar
      </button>

      <button type="submit" disabled={guardando}>
        {guardando ? "Guardando..." : productoEditando ? "Guardar cambios" : "Guardar producto"}
      </button>
    </div>
  </form>
)}

          <label className="modulo-busqueda">Buscar productos
          <input
            className="buscador"
            type="search"
            placeholder="Buscar por nombre o código de barras..."
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          </label>

          {error && <div className="error" role="alert">{error}</div>}

          <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Catálogo de productos">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Código</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Estado</th>
                  {usuario.rol === "DUENO" && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((producto) => (
                  <tr key={producto.ID_PRODUCTO}>
                    <td><div className="producto-identidad">
                      {miniaturas[producto.ID_PRODUCTO]?.ruta && <img src={miniaturas[producto.ID_PRODUCTO].ruta} alt="" width="44" height="44" loading="lazy" decoding="async" />}
                      <strong>{producto.NOMBRE_PRODUCTO}</strong>
                    </div></td>
                    <td>{producto.CODIGO_BARRA}</td>
                    <td className="modulo-numero">
                      {formatoPrecio(producto.PRECIO_VENTA_ACTUAL)}
                    </td>
                    <td>
                      <span
                        className={
                          Number(producto.STOCK_ACTUAL) <=
                          Number(producto.STOCK_CRITICO)
                            ? "stock-bajo"
                            : ""
                        }
                      >
                        {producto.STOCK_ACTUAL}
                      </span>
                    </td>
                    <td><EtiquetaEstado tono={producto.ESTADO_PRODUCTO === "S" ? "exito" : "neutro"}>{producto.ESTADO_PRODUCTO === "S" ? "Activo" : "Inactivo"}</EtiquetaEstado></td>
                    {usuario.rol === "DUENO" && (
                      <td>
                        <div className="acciones-producto">
                          <button
                            type="button"
                            className="boton-editar"
                            onClick={() => abrirEdicion(producto)}
                            disabled={guardando || desactivandoId !== null || producto.ESTADO_PRODUCTO !== "S"}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="boton-desactivar"
                            onClick={() => desactivarProducto(producto)}
                            disabled={guardando || desactivandoId !== null || producto.ESTADO_PRODUCTO !== "S"}
                          >
                            {desactivandoId === producto.ID_PRODUCTO ? "Desactivando..." : "Desactivar"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!cargando && !error && productosFiltrados.length === 0 && (
            <div className="modulo-vacio">
              <h3>No hay productos para mostrar</h3>
              <p>
                {busqueda
                  ? "No encontramos productos con esa búsqueda."
                  : "La tabla PRODUCTO todavía no tiene registros."}
              </p>
            </div>
          )}

          <div className="panel-pie">
            Mostrando {productosFiltrados.length} productos.
            La API actualmente consulta un máximo de 20.
          </div>
        </section>
        </div>
        )}
      </main>
    </div>
  );
}

export default App;

