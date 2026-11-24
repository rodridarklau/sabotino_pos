import { useState } from "react";

const normalizar = (texto = "") => texto.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
const moneda = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 2 });
const cantidad = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

function cantidadInicial(producto) {
  return producto.PERMITE_DECIMALES === "S"
    ? Math.min(1, producto.STOCK_ACTUAL) : Math.min(1, Math.floor(producto.STOCK_ACTUAL));
}

function Foto({ ruta }) {
  const [fallo, setFallo] = useState(false);
  return ruta && !fallo
    ? <img src={ruta} alt="" width="512" height="512" loading="lazy" decoding="async" onError={() => setFallo(true)} />
    : <svg viewBox="0 0 90 90" width="58" height="58" aria-hidden="true" fill="none">
      <path d="M20 57c-4-18 8-33 25-33 17 0 29 15 25 33-4 9-46 9-50 0Z" fill="#e7cf9c" stroke="#a3814e" strokeWidth="2" />
      <path d="M33 42q4-8 10-10m0 14q4-8 10-10m-1 13q4-8 10-10" stroke="#a3814e" strokeWidth="2.4" strokeLinecap="round" />
    </svg>;
}

function Tarjeta({ producto, agregar, bloqueado, elegido }) {
  const sinStock = !(cantidadInicial(producto) > 0);
  const bajo = !sinStock && producto.STOCK_ACTUAL <= producto.STOCK_CRITICO;
  const estado = sinStock ? "Agotado" : bajo ? "Stock bajo" : "";
  return <article className="pos-tarjeta">
    <div className="pos-foto">
      <Foto ruta={producto.VISUAL?.ruta} key={producto.VISUAL?.ruta ?? ""} />
      {estado && <span className={`pos-saldo ${sinStock ? "agotado" : ""}`}>{estado}</span>}
    </div>
    <div className="pos-tarjeta-contenido">
      <h3>{producto.NOMBRE_PRODUCTO}</h3>
      <p className="pos-precio"><strong>{moneda.format(producto.PRECIO_VENTA_ACTUAL)}</strong> <span>/ {producto.CODIGO_UNIDAD}</span></p>
      <p className="pos-stock">Disponible: {cantidad.format(producto.STOCK_ACTUAL)} {producto.CODIGO_UNIDAD}</p>
      <button type="button" className="pos-agregar" disabled={bloqueado || elegido || sinStock}
        aria-label={elegido ? `${producto.NOMBRE_PRODUCTO} agregado` : `Agregar ${producto.NOMBRE_PRODUCTO}`}
        onClick={() => agregar(producto, cantidadInicial(producto))}>
        <span aria-hidden="true">{elegido ? "✓" : "+"}</span> {elegido ? "Agregado" : "Agregar"}
      </button>
    </div>
  </article>;
}

export default function CatalogoVenta({ productos, lineas, agregar, bloqueado, listo }) {
  const [buscar, setBuscar] = useState("");
  const [categoria, setCategoria] = useState("");
  const [rapido, setRapido] = useState(false);
  const elegidos = new Set(lineas.map((linea) => linea.productoId));
  const categorias = [...new Set(productos.map((p) => p.NOMBRE_CATEGORIA).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const categoriaVigente = categorias.includes(categoria) ? categoria : "";
  const esRapido = (p) => p.VISUAL?.favorito || p.VENTAS_RECIENTES >= 2;
  const texto = normalizar(buscar);
  const visibles = productos.filter((p) =>
    (!categoriaVigente || p.NOMBRE_CATEGORIA === categoriaVigente) && (!rapido || esRapido(p)) &&
    (normalizar(p.NOMBRE_PRODUCTO).includes(texto) || normalizar(p.CODIGO_BARRA ?? "").includes(texto))
  );
  const accesos = rapido ? visibles.toSorted((a, b) => Number(Boolean(b.VISUAL?.favorito)) - Number(Boolean(a.VISUAL?.favorito))
    || (b.VENTAS_RECIENTES ?? 0) - (a.VENTAS_RECIENTES ?? 0)) : visibles;
  const limite = bloqueado || lineas.length >= 100;
  return <section id="ventas-catalogo" className="panel pos-catalogo" aria-labelledby="ventas-catalogo-titulo" tabIndex={-1}>
    <h2 id="ventas-catalogo-titulo">Catálogo de venta</h2>
    <div className="campos-producto pos-filtros">
      <label>Buscar producto<input type="search" placeholder="Nombre o código de barras" value={buscar}
        onChange={(e) => setBuscar(e.target.value)} /></label>
      <label>Categoría<select value={categoriaVigente} onChange={(e) => setCategoria(e.target.value)}>
        <option value="">Todas las categorías</option>{categorias.map((c) => <option key={c}>{c}</option>)}
      </select></label>
    </div>
    <div className="pos-vistas" role="group" aria-label="Vista del catálogo">
      <button type="button" className="secundario" aria-pressed={!rapido} onClick={() => setRapido(false)}>Todos los productos</button>
      <button type="button" className="secundario" aria-pressed={rapido} onClick={() => setRapido(true)}>Acceso rápido</button>
    </div>
    {listo && !accesos.length && <p className="pos-vacio">
      {rapido && !productos.some(esRapido) ? "Todavía no hay favoritos ni productos de venta frecuente." : "No hay productos que coincidan con los filtros."}
    </p>}
    <div className="pos-tarjetas">
      {accesos.map((producto) => <Tarjeta key={producto.ID_PRODUCTO} producto={producto} agregar={agregar}
        bloqueado={limite} elegido={elegidos.has(producto.ID_PRODUCTO)} />)}
    </div>
  </section>;
}

