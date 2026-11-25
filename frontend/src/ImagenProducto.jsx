import { useEffect, useState } from "react";
import { normalizar, sugerirImagen } from "./bibliotecaProducto.js";
import "./ImagenProducto.css";

const api = "/api/productos-imagenes";

export default function ImagenProducto({ id, nombre, categoriaProducto, cambio, alCambiar, bloqueado, guardarSoloImagen }) {
  const [biblioteca, setBiblioteca] = useState([]);
  const [guardado, setGuardado] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [categoria, setCategoria] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [avisoIA, setAvisoIA] = useState(false);
  const [error, setError] = useState("");
  const [errorAsociacion, setErrorAsociacion] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const c = new AbortController();
    fetch("/productos-base/manifiesto.json", { signal: c.signal }).then(async (r) => {
      if (!r.ok) throw new Error("No se pudo abrir la biblioteca");
      const lista = await r.json();
      if (!c.signal.aborted) setBiblioteca(lista);
    }).catch((e) => { if (!c.signal.aborted) setError(e.message); });
    if (id) fetch(api, { signal: c.signal }).then(async (r) => {
      if (!r.ok) throw new Error("No se pudo cargar la imagen actual");
      const datos = await r.json();
      if (!c.signal.aborted) setGuardado(datos[id] ?? {});
    }).catch((e) => { if (!c.signal.aborted) setErrorAsociacion(e.message); });
    return () => c.abort();
  }, [id]);

  const archivo = cambio?.archivo;
  useEffect(() => {
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    let vigente = true;
    imagen.onload = () => {
      if (vigente) setPreview({ archivo, url });
    };
    imagen.onerror = () => {
      if (vigente) { setError("No se pudo abrir la fotografía seleccionada"); setPreview(null); }
    };
    imagen.src = url;
    return () => { vigente = false; URL.revokeObjectURL(url); };
  }, [archivo]);

  const datos = cambio ?? { favorito: guardado?.favorito ?? false, revision: guardado?.revision ?? 0 };
  const imagenElegida = cambio?.imagen === undefined ? guardado?.ruta : biblioteca.find((b) => b.id === cambio.imagen)?.ruta;
  const ruta = archivo ? (preview?.archivo === archivo ? preview.url : null) : imagenElegida;
  const categorias = [...new Set(biblioteca.map((b) => b.categoria))];
  const visibles = biblioteca.filter((b) => (!categoria || categoria === b.categoria) &&
    [b.nombre, ...b.sinonimos].some((valor) => normalizar(valor).includes(normalizar(buscar))));
  const sugerida = sugerirImagen(biblioteca, nombre, categoriaProducto);
  const deshabilitado = bloqueado || Boolean(id && !guardado);

  function elegir(imagen) {
    setError("");
    alCambiar({ ...datos, archivo: null, imagen });
    setMostrar(false);
  }

  return <fieldset className="imagen-producto" disabled={deshabilitado}>
    <legend>Imagen del producto</legend>
    <div className="imagen-edicion">
      <div className="imagen-preview">{ruta ? <img src={ruta} alt="Vista previa de la imagen elegida" /> : <p>Sin imagen</p>}</div>
      <div className="imagen-herramientas">
        <div className="imagen-acciones">
          <button type="button" className="secundario" aria-expanded={mostrar} onClick={() => { setMostrar(!mostrar); setBorrador(null); }}>Elegir de la biblioteca</button>
          <button type="button" className="secundario" aria-expanded={avisoIA} onClick={() => setAvisoIA(!avisoIA)}>Generar imagen con IA</button>
          {ruta && <button type="button" className="secundario" onClick={() => elegir(null)}>Quitar imagen</button>}
        </div>
        <label>Subir fotografía <span className="imagen-ayuda">JPG, PNG o WebP · máximo 5 MB</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(evento) => {
            const foto = evento.target.files?.[0];
            evento.target.value = "";
            if (!foto) return;
            if (!["image/jpeg", "image/png", "image/webp"].includes(foto.type) || foto.size > 5 * 1024 * 1024 || !foto.size) {
              setError("Selecciona una fotografía JPG, PNG o WebP de hasta 5 MB");
              return;
            }
            setError("");
            alCambiar({ ...datos, imagen: undefined, archivo: foto });
          }} />
        </label>
        <label className="imagen-favorito"><input type="checkbox" checked={datos.favorito}
          onChange={(e) => alCambiar({ ...datos, favorito: e.target.checked })} /> Mostrar en Acceso rápido</label>
        {id && cambio && <button type="button" onClick={guardarSoloImagen}>Guardar imagen y favorito</button>}
        {avisoIA && <p className="imagen-ayuda" role="status">La generación con IA está desactivada. Requiere configurar un proveedor y habilitar su uso.</p>}
        {sugerida && !ruta && !archivo && <button type="button" className="secundario"
          onClick={() => { setBorrador(sugerida); setCategoria(""); setBuscar(""); setMostrar(true); }}>Ver sugerencia: {sugerida.nombre}</button>}
      </div>
    </div>
    {(error || errorAsociacion) && <p className="error" role="alert">{errorAsociacion || error}</p>}
    {mostrar && <section className="imagen-biblioteca" aria-label="Biblioteca de imágenes">
      <div className="campos-producto">
        <label>Buscar imágenes<input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></label>
        <label>Categoría de imagen<select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas</option>{categorias.map((c) => <option key={c}>{c}</option>)}
        </select></label>
      </div>
      <div className="imagen-galeria">{visibles.map((b) => <button type="button" key={b.id} aria-pressed={borrador?.id === b.id}
        onClick={() => setBorrador(b)}>
        <img src={b.ruta} alt="" loading="lazy" width="120" height="120" /><span>{b.nombre}</span>
      </button>)}</div>
      {!visibles.length && <p className="imagen-ayuda">No se encontraron imágenes.</p>}
      {borrador && <div className="imagen-seleccion">
        <img src={borrador.ruta} alt={borrador.nombre} width="72" height="72" />
        <span>{borrador.nombre}</span>
        <button type="button" onClick={() => elegir(borrador.id)}>Confirmar imagen</button>
      </div>}
    </section>}
  </fieldset>;
}
