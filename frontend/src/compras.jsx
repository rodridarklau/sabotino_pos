import { useEffect, useMemo, useRef, useState } from "react";
import "./Compras.css";
import { CabeceraModulo, PestanasModulo } from "./Presentacion.jsx";

const vistasCompra = [["nueva", "Nuevo abastecimiento"], ["historial", "Historial de compras"]];

const API = "/api/compras";

function lineaVacia(clave, idProducto = null) {
  return {
    clave,
    tipo: "PRODUCTO",
    idArticulo: idProducto == null ? "" : String(idProducto),
    idProveedor: "",
    cantidad: "",
    costoUnitario: ""
  };
}

function formatoCLP(numero) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(numero) || 0);
}

export default function Compras({ productoInicial, onVolver, onCompraRegistrada }) {
  const siguienteClave = useRef(2);
  const [vista, setVista] = useState("nueva");
  const [lineas, setLineas] = useState([lineaVacia(1, productoInicial)]);
  const [catalogos, setCatalogos] = useState({ productos: [], insumos: [], proveedores: [] });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [abrirProveedor, setAbrirProveedor] = useState(false);
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState({
    rut: "", razonSocial: "", telefono: "", email: ""
  });

async function consultarHistorial(signal) {
  try {
    const respuesta = await fetch(
      "/api/compras/historial", { signal }
    );

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(
        datos.mensaje || "No se pudo cargar el historial"
      );
    }

    if (!signal?.aborted) setHistorial(datos.movimientos ?? []);

  } catch (error) {
    if (!signal?.aborted) setErrorHistorial(error.message);

  } finally {
    if (!signal?.aborted) setCargandoHistorial(false);
  }
}

function cargarHistorial() {
  setCargandoHistorial(true);
  setErrorHistorial("");
  return consultarHistorial();
}

  async function cargarCatalogos() {
    const respuesta = await fetch(`${API}/catalogos`);
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudieron consultar los catálogos");
    setCatalogos(datos);
    return datos;
  }

  useEffect(() => {
    let vigente = true;
    async function iniciar() {
      try {
        await cargarCatalogos();
      } catch (err) {
        if (vigente) setError(err.message);
      } finally {
        if (vigente) setCargando(false);
      }
    }
    iniciar();
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    const control = new AbortController();
    void Promise.resolve().then(() => {
      if (!control.signal.aborted) return consultarHistorial(control.signal);
    });
    return () => control.abort();
  }, []);

  function listaDeArticulos(tipo) {
    return tipo === "INSUMO" ? catalogos.insumos : catalogos.productos;
  }

  function actualizarLinea(clave, campo, valor) {
    setLineas((anteriores) => anteriores.map((linea) => {
      if (linea.clave !== clave) return linea;
      if (campo === "tipo") {
        return { ...linea, tipo: valor, idArticulo: "", cantidad: "", costoUnitario: "" };
      }
      return { ...linea, [campo]: valor };
    }));
    setError("");
    setExito("");
  }

  function agregarLinea() {
    setLineas((anteriores) => [...anteriores, lineaVacia(siguienteClave.current++)]);
    setError("");
    setExito("");
  }

  function eliminarLinea(clave) {
    setLineas((anteriores) => anteriores.filter((linea) => linea.clave !== clave));
  }

  const totalEstimado = useMemo(() => lineas.reduce((total, linea) => {
    const cantidad = Number(linea.cantidad) || 0;
    const costo = Number(linea.costoUnitario) || 0;
    return total + Math.max(0, cantidad) * Math.max(0, costo);
  }, 0), [lineas]);

  async function guardarCompra(evento) {
    evento.preventDefault();
    if (guardando) return;
    setError("");
    setExito("");

    // Validación de unidades. El backend y Oracle vuelven a validar.
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const articulo = listaDeArticulos(linea.tipo).find((a) =>
        String(linea.tipo === "INSUMO" ? a.ID_INSUMO : a.ID_PRODUCTO) === linea.idArticulo
      );
      if (!articulo) {
        setError(`Línea ${i + 1}: selecciona un artículo válido`);
        return;
      }
      const cantidad = Number(linea.cantidad);
      const costo = Number(linea.costoUnitario);
      if (!linea.idProveedor || !Number.isFinite(cantidad) || cantidad <= 0 ||
          Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 0.00001 ||
          !linea.costoUnitario.trim() || !Number.isFinite(costo) || costo < 0 ||
          Math.abs(costo * 100 - Math.round(costo * 100)) > 0.00001) {
        setError(`Línea ${i + 1}: revisa el proveedor, la cantidad y el costo`);
        return;
      }
      if (articulo.PERMITE_DECIMALES !== "S" && !Number.isInteger(cantidad)) {
        setError(`Línea ${i + 1}: la unidad ${articulo.CODIGO_UNIDAD} no permite decimales`);
        return;
      }
    }

    const confirmar = window.confirm(
      `¿Registrar ${lineas.length} artículo(s) por ${formatoCLP(totalEstimado)}? ` +
      "Esta operación modificará las existencias en Oracle."
    );
    if (!confirmar) return;

    setGuardando(true);
    try {
      const articulos = lineas.map((l) => ({
        tipo: l.tipo,
        id_articulo: Number(l.idArticulo),
        id_proveedor: Number(l.idProveedor),
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costoUnitario)
      }));

      const respuesta = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articulos })
      }).catch(() => null);
      const datos = await respuesta?.json().catch(() => null);
      if (!datos || datos.estado === "INCIERTO") {
        setLineas([lineaVacia(siguienteClave.current++)]);
        setError("No se pudo confirmar la compra. Revisa el historial y las existencias antes de repetirla.");
        await cargarHistorial();
        return;
      }
      if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudo registrar la compra");

      setExito(
        `Compra registrada: ${datos.cantidadLineas} línea(s), total ${formatoCLP(datos.totalCompra)}. ` +
        "Las existencias ya fueron actualizadas."
      );
      setLineas([lineaVacia(siguienteClave.current++)]);
      await cargarHistorial();
      // La compra YA fue confirmada en Oracle. Un fallo al refrescar
      // catálogos no debe presentarse como fallo de la compra.
      try {
        await cargarCatalogos();
        if (onCompraRegistrada) await onCompraRegistrada();
      } catch (refrescoError) {
        console.error("Compra registrada, pero falló la actualización visual:", refrescoError);
        setError("La compra SÍ se registró; solo falló la actualización de la pantalla. No la repitas. Recarga la página.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function registrarProveedor(evento) {
    evento.preventDefault();
    if (guardandoProveedor) return;
    setGuardandoProveedor(true);
    setError("");
    try {
      const respuesta = await fetch(`${API}/proveedores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevoProveedor)
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudo registrar el proveedor");
      setNuevoProveedor({ rut: "", razonSocial: "", telefono: "", email: "" });
      setAbrirProveedor(false);
      setExito("Proveedor registrado correctamente.");
      try {
        await cargarCatalogos();
        setLineas((anteriores) => anteriores.map((linea, i) =>
          i === 0 && !linea.idProveedor
            ? { ...linea, idProveedor: String(datos.idProveedor) }
            : linea
        ));
      } catch (refrescoError) {
        console.error("Proveedor creado, pero falló la actualización visual:", refrescoError);
        setError("El proveedor SÍ fue creado. No lo vuelvas a registrar; actualiza la página.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoProveedor(false);
    }
  }

  return (
    <section className="compras-vista modulo">
      <CabeceraModulo modulo="compras" titulo="Compras y abastecimiento"
        descripcion="Registra uno o varios productos e insumos en una misma compra.">
        <button type="button" className="compras-secundario" onClick={onVolver}>
          ← Volver a productos
        </button>
      </CabeceraModulo>
      <PestanasModulo etiqueta="Vistas de Compras" prefijo="compras" opciones={vistasCompra} activa={vista} seleccionar={setVista} />

      {error && <div className="compras-error" role="alert">{error}</div>}
      {exito && <div className="compras-exito" role="status">{exito}</div>}
      <div id="compras-nueva" className="modulo-pila" hidden={vista !== "nueva"}>
      {cargando ? (
        <div className="compras-tarjeta" role="status">Cargando productos, insumos y proveedores...</div>
      ) : (
        <>
          <div className="compras-tarjeta compras-proveedores">
            <div>
              <h2>Proveedores</h2>
              <p>Disponibles: {catalogos.proveedores.length}. Cada línea puede usar un proveedor distinto.</p>
              {catalogos.proveedores.length === 0 && (
                <p className="compras-advertencia">No hay proveedores: registra uno antes de comprar.</p>
              )}
            </div>
            <button type="button" onClick={() => setAbrirProveedor((v) => !v)}>
              {abrirProveedor ? "Cerrar formulario" : "+ Nuevo proveedor"}
            </button>
          </div>

          {abrirProveedor && (
            <form className="compras-tarjeta compras-nuevo-proveedor" onSubmit={registrarProveedor}>
              <h3>Registrar proveedor</h3>
              <div className="compras-grid">
                <label>RUT del proveedor
                  <input value={nuevoProveedor.rut} maxLength={12} required
                    onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, rut: e.target.value })} />
                </label>
                <label>Razón social
                  <input value={nuevoProveedor.razonSocial} maxLength={120} required
                    onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, razonSocial: e.target.value })} />
                </label>
                <label>Teléfono (opcional)
                  <input value={nuevoProveedor.telefono} maxLength={20}
                    onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, telefono: e.target.value })} />
                </label>
                <label>Correo (opcional)
                  <input type="email" value={nuevoProveedor.email} maxLength={100}
                    onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, email: e.target.value })} />
                </label>
              </div>
              <div className="compras-acciones">
                <button type="submit" disabled={guardandoProveedor}>
                  {guardandoProveedor ? "Guardando..." : "Guardar proveedor"}
                </button>
              </div>
            </form>
          )}

          <form onSubmit={guardarCompra} className="compras-tarjeta modulo-operacion">
            <div className="compras-titulo-lineas">
              <div>
                <h2>Artículos de la compra</h2>
                <p>El stock se actualizará al confirmar toda la compra.</p>
              </div>
              <button type="button" onClick={agregarLinea} disabled={lineas.length >= 50}>
                + Agregar otro artículo
              </button>
            </div>

            {lineas.map((linea, indice) => {
              const articulos = listaDeArticulos(linea.tipo);
              const articulo = articulos.find((a) =>
                String(linea.tipo === "PRODUCTO" ? a.ID_PRODUCTO : a.ID_INSUMO) === linea.idArticulo
              );
              const decimal = articulo?.PERMITE_DECIMALES === "S";
              return (
                <div key={linea.clave} className="compras-linea">
                  <div className="compras-linea-cabecera">
                    <h3>Artículo {indice + 1}</h3>
                    <button type="button" className="compras-eliminar" disabled={lineas.length === 1}
                      onClick={() => eliminarLinea(linea.clave)}>
                      Quitar artículo
                    </button>
                  </div>
                  <div className="compras-grid">
                    <label>Tipo de artículo
                      <select value={linea.tipo} onChange={(e) => actualizarLinea(linea.clave, "tipo", e.target.value)}>
                        <option value="PRODUCTO">Producto</option>
                        <option value="INSUMO">Insumo</option>
                      </select>
                    </label>
                    <label>{linea.tipo === "PRODUCTO" ? "Producto" : "Insumo"}
                      <select required value={linea.idArticulo}
                        onChange={(e) => actualizarLinea(linea.clave, "idArticulo", e.target.value)}>
                        <option value="">Selecciona un artículo</option>
                        {articulos.map((a) => {
                          const id = linea.tipo === "PRODUCTO" ? a.ID_PRODUCTO : a.ID_INSUMO;
                          const nombre = linea.tipo === "PRODUCTO" ? a.NOMBRE_PRODUCTO : a.NOMBRE_INSUMO;
                          return <option key={id} value={id}>{nombre} · Stock: {a.STOCK_ACTUAL} {a.CODIGO_UNIDAD}</option>;
                        })}
                      </select>
                    </label>
                    <label>Proveedor
                      <select required value={linea.idProveedor}
                        onChange={(e) => actualizarLinea(linea.clave, "idProveedor", e.target.value)}>
                        <option value="">Selecciona un proveedor</option>
                        {catalogos.proveedores.map((proveedor) => (
                          <option key={proveedor.ID_PROVEEDOR} value={proveedor.ID_PROVEEDOR}>
                            {proveedor.RAZON_SOCIAL}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>Cantidad {articulo ? `(${articulo.CODIGO_UNIDAD})` : ""}
                      <input required type="number" min={decimal ? "0.001" : "1"} step={decimal ? "0.001" : "1"}
                        placeholder={decimal ? "Ej. 2.500" : "Ej. 30"}
                        value={linea.cantidad}
                        onChange={(e) => actualizarLinea(linea.clave, "cantidad", e.target.value)} />
                    </label>
                    <label>Costo unitario (CLP)
                      <input required type="number" min="0" step="0.01" placeholder="Ej. 300"
                        value={linea.costoUnitario}
                        onChange={(e) => actualizarLinea(linea.clave, "costoUnitario", e.target.value)} />
                    </label>
                    <div className="compras-subtotal">
                      <span>Subtotal artículo {indice + 1}</span>
                      <strong>{formatoCLP((Number(linea.cantidad) || 0) * (Number(linea.costoUnitario) || 0))}</strong>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="compras-resumen">
              <span>{lineas.length} artículo(s) seleccionados</span>
              <div><span>Total estimado</span><strong>{formatoCLP(totalEstimado)}</strong></div>
            </div>
            <p className="compras-nota">
              Oracle procesa todas las líneas juntas. Si una falla, no se registra ninguna.
              El dueño responsable se obtiene de tu sesión iniciada.
            </p>
            <div className="compras-acciones">
              <button type="button" className="compras-secundario" onClick={onVolver}>Cancelar</button>
              <button type="submit" disabled={guardando || catalogos.proveedores.length === 0}>
                {guardando ? "Registrando..." : "Registrar compra"}
              </button>
            </div>
          </form>
        </>
      )}

</div>
<section id="compras-historial" className="compras-tarjeta" hidden={vista !== "historial"}>

  <div className="compras-titulo-lineas">
    <div>
      <h2>Historial de compras</h2>
      <p>
        Últimos 100 abastecimientos de productos
        registrados en Oracle.
      </p>
    </div>

    <button
      type="button"
      onClick={cargarHistorial}
      disabled={cargandoHistorial}
    >
      {cargandoHistorial
        ? "Actualizando..."
        : "Actualizar historial"}
    </button>
  </div>

  {errorHistorial && (
    <div className="compras-error" role="alert">
      {errorHistorial}
    </div>
  )}

  {cargandoHistorial ? (
    <p role="status">Cargando historial...</p>
  ) : historial.length === 0 ? (
    <p className="modulo-vacio">No hay abastecimientos de productos registrados.</p>
  ) : (
    <div className="tabla-contenedor" tabIndex={0} role="region" aria-label="Historial de compras">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Proveedor</th>
            <th>Cantidad</th>
            <th>Costo unitario</th>
            <th>Total</th>
            <th>Responsable</th>
          </tr>
        </thead>

        <tbody>
          {historial.map((compra) => (
            <tr key={compra.ID_ABASTECIMIENTO}>

              <td>{compra.FECHA_COMPRA}</td>

              <td>{compra.NOMBRE_PRODUCTO}</td>

              <td>{compra.PROVEEDOR}</td>

              <td>
                {compra.CANTIDAD_COMPRADA}{" "}
                {compra.CODIGO_UNIDAD}
              </td>

              <td className="modulo-numero">
                {formatoCLP(
                  compra.COSTO_UNITARIO_COMPRA
                )}
              </td>

              <td>
                <strong>
                  {formatoCLP(compra.TOTAL)}
                </strong>
              </td>

              <td>{compra.RESPONSABLE}</td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}

</section>

    </section>
  );
}
