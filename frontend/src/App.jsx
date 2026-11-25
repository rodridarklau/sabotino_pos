
import { useEffect, useState } from "react";
import { Borradores } from "./borradores.js";
import { CabeceraModulo, EtiquetaEstado, TarjetaDato } from "./Presentacion.jsx";
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
import { sugerirImagen } from "./bibliotecaProducto.js";

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
  const [borradores] = useState(() => new Map());
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
  const [ajusteInicial, setAjusteInicial] = useState(null);
  const [borradorInsumo, setBorradorInsumo] = useState(null);
  const [proveedorParaInsumo, setProveedorParaInsumo] = useState(false);
  const miniaturas = useMiniaturas(vista === "productos" && usuario.rol === "DUENO", revisionVisual, productos);

  function permitirSalir(destino) {
    if (destino === vista) return true;
    if ([...borradores].some(([clave, item]) => item.modulo === vista && /:envio(?:Apertura|Proveedor|-ajuste)?$/.test(clave) && item.valor === true)) {
      window.alert("Espera a que termine la operación antes de cambiar de módulo.");
      return false;
    }
    const pendiente = (vista === "productos" && mostrarFormulario) ||
      (vista === "insumos" && Boolean(borradorInsumo)) ||
      [...borradores.values()].some((item) => item.modulo === vista && item.pendiente);
    return !pendiente || window.confirm("Hay un formulario pendiente. ¿Salir y conservar el borrador de esta sesión?");
  }

  function irACompras(producto = null) {
    if (usuario.rol !== "DUENO" || !permitirSalir("compras")) return;
    setProductoSugerido(producto?.ID_PRODUCTO ?? null);
    setVista("compras");
  }

  function volverAProductos() {
    if (!permitirSalir("productos")) return;
    setVista("productos");
    setProductoSugerido(null);
    cargarProductos();
  }

  function seleccionarVista(destino) {
    if (destino === "productos") return volverAProductos();
    if (destino === "compras") return irACompras();
    if (!permitirSalir(destino)) return;
    if (destino !== "proveedores" || vista !== "proveedores") setProveedorParaInsumo(false);
    document.getElementById("contenido-principal")?.focus();
    window.scrollTo(0, 0);
    if (destino === "inventario" || destino === "insumos") {
      setBusquedaInventario("");
      setAjusteInicial(null);
    }
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
    if (visual || !editando) {
      try {
        let imagen = visual;
        if (!imagen) {
          const biblioteca = await fetch("/productos-base/manifiesto.json");
          if (!biblioteca.ok) throw new Error("No se pudo consultar la biblioteca.");
          const categoria = catalogos.categorias.find((c) => String(c.ID_CATEGORIA) === nuevoProducto.idCategoria);
          const sugerida = sugerirImagen(await biblioteca.json(), nuevoProducto.nombreProducto, categoria?.NOMBRE_CATEGORIA);
          if (sugerida) imagen = { imagen: sugerida.id, favorito: false, revision: 0 };
        }
        if (imagen) await guardarVisual(datos.idProducto ?? productoEditando?.ID_PRODUCTO, imagen);
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
    <Borradores.Provider value={borradores}><div className="app">
      <a className="salto-contenido" href="#contenido-principal">Saltar al contenido</a>
      <Navegacion vista={vista} usuario={usuario} seleccionar={seleccionarVista} salir={onLogout} />

      <main className="contenido" id="contenido-principal" tabIndex={-1}>
        {vista === "inicio" ? (
          <Inicio usuario={usuario} seleccionar={seleccionarVista} abastecer={irACompras} verInsumo={(nombre) => {
            if (!permitirSalir("insumos")) return;
            setBusquedaInventario(nombre);
            setVista("insumos");
          }} />
        ) : vista === "reportes" && usuario.rol === "DUENO" ? (
          <Reportes irACompras={(id) => irACompras({ ID_PRODUCTO: id })}
            irAInventario={(nombre) => {
              if (!permitirSalir("inventario")) return;
              setAjusteInicial(null); setBusquedaInventario(nombre); setVista("inventario");
            }} />
        ) : vista === "vendedores" && usuario.rol === "DUENO" ? (
          <Vendedores />
        ) : vista === "caja" ? (
          <Caja irAVentas={() => seleccionarVista("ventas")} />
        ) : vista === "ventas" ? (
          <Ventas usuario={usuario} onVentaRegistrada={cargarProductos} onIrACaja={() => seleccionarVista("caja")} />
        ) : ["inventario", "insumos"].includes(vista) && usuario.rol === "DUENO" ? (
          <Inventario key={vista} soloInsumos={vista === "insumos"} ajusteInicial={vista === "inventario" ? ajusteInicial : null}
            busquedaInicial={busquedaInventario} onAjusteRegistrado={cargarProductos}
            borradorInsumo={borradorInsumo} cambiarBorrador={setBorradorInsumo} crearProveedor={() => {
              setProveedorParaInsumo(true);
              setVista("proveedores");
              window.scrollTo(0, 0);
            }} />
        ) : vista === "compras" && usuario.rol === "DUENO" ? (
          <Compras
            productoInicial={productoSugerido}
            onVolver={volverAProductos}
            onCompraRegistrada={cargarProductos}
          />
        ) : vista === "proveedores" && usuario.rol === "DUENO" ? (
        <Proveedores inicioEnAlta={proveedorParaInsumo} onVolver={proveedorParaInsumo ? () => seleccionarVista("insumos") : volverAProductos}
          alCrear={proveedorParaInsumo ? (id) => setBorradorInsumo((datos) => datos && { ...datos, proveedorId: String(id) }) : undefined} />
      ) : (
        <div className="modulo modulo-pila productos">
        <CabeceraModulo modulo="productos" titulo="Gestión de productos" descripcion="Consulta el catálogo y supervisa el inventario." />

        <dl className="resumen-modulo">
          <TarjetaDato titulo="Productos cargados" tono="dorado" arte="cupcake-chef" icono="M12 3l8 5v8l-8 5-8-5V8z M4 8l8 5 8-5 M12 13v8">{cargando ? "—" : productos.length}</TarjetaDato>
          <TarjetaDato titulo="Productos en stock crítico" tono="lavanda" arte="abastecimiento" icono="M12 3 2 20h20z M12 9v4m0 3h.01">{cargando ? "—" : stockCritico}</TarjetaDato>
        </dl>

        <div className="productos-distribucion">
        <section className="panel productos-catalogo">
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
    <p className="nota-edicion">Todos los campos de texto y selección de este producto son obligatorios.</p>
    <div className="acciones-formulario">
      <button className="secundario" type="button" disabled={guardando} onClick={() => seleccionarVista("proveedores")}>
        Gestionar proveedores
      </button>
      {productoEditando?.PROVEEDOR_ACTUAL && <span>Último proveedor: {productoEditando.PROVEEDOR_ACTUAL}</span>}
    </div>
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
          placeholder="Ej. 7801234567890"
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
                      <div><strong>{producto.NOMBRE_PRODUCTO}</strong>
                        {usuario.rol === "DUENO" && <small className="proveedor-actual">{producto.PROVEEDOR_ACTUAL || "Sin abastecimientos registrados"}</small>}
                      </div>
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
                            ? "stock-pildora stock-bajo"
                            : "stock-pildora"
                        }
                      >
                        {producto.STOCK_ACTUAL}
                      </span>
                    </td>
                    <td><EtiquetaEstado tono={producto.ESTADO_PRODUCTO === "S" ? "exito" : "neutro"}>{producto.ESTADO_PRODUCTO === "S" ? "Activo" : "Inactivo"}</EtiquetaEstado></td>
                    {usuario.rol === "DUENO" && (
                      <td>
                        <div className="acciones-producto">
                          {producto.ESTADO_PRODUCTO === "S" && [[1, "Añadir stock"], [-1, "Quitar stock"]].map(([sentido, etiqueta]) =>
                            <button key={sentido} className="secundario" type="button" onClick={() => {
                              if (!permitirSalir("inventario")) return;
                              setBusquedaInventario(producto.NOMBRE_PRODUCTO);
                              setAjusteInicial({ id: producto.ID_PRODUCTO, sentido });
                              setVista("inventario");
                              window.scrollTo(0, 0);
                            }}>{etiqueta}</button>)}
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
            <div className="modulo-vacio vacio-ilustrado">
              <img src="/branding/abastecimiento.svg" alt="" />
              <h3>No hay productos para mostrar</h3>
              <p>
                {busqueda
                  ? "No encontramos productos con esa búsqueda."
                  : "Todavía no hay productos registrados."}
              </p>
              {busqueda && <button className="secundario" type="button" onClick={() => setBusqueda("")}>Limpiar búsqueda</button>}
              {!busqueda && !mostrarFormulario && usuario.rol === "DUENO" &&
                <button type="button" onClick={abrirFormulario}>Registrar primer producto</button>}
            </div>
          )}

          <div className="panel-pie">
            Mostrando {productosFiltrados.length} productos.
            La API actualmente consulta un máximo de 20.
          </div>
        </section>
        <aside className="panel productos-resumen">
          <h2>Resumen del catálogo</h2>
          <dl>{[["Productos cargados", productos.length], ["Productos activos", productos.filter((p) => p.ESTADO_PRODUCTO === "S").length],
            ["Productos inactivos", productos.filter((p) => p.ESTADO_PRODUCTO === "N").length]].map(([nombre, conteo]) =>
            <div key={nombre}><dt>{nombre}</dt><dd>{cargando || error ? "—" : conteo}</dd></div>)}</dl>
          <img src="/branding/cupcake-chef.svg" alt="" />
        </aside>
        </div>
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
        </div>
        )}
      </main>
    </div></Borradores.Provider>
  );
}

export default App;

