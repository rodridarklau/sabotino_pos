import { useEffect, useRef, useState } from "react";
import { buscarProveedorPropio } from "./proveedorPropio.js";
import { useBorrador } from "./borradores.js";

const cantidades = [["costo", "Costo unitario en CLP"], ["stockInicial", "Stock inicial"], ["stockCritico", "Stock crítico"]];

async function leer(ruta, signal) {
  const respuesta = await fetch(ruta, { signal });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.mensaje);
  return datos;
}

export default function NuevoInsumo({ datos, cambiar, cancelar, crearProveedor, alGuardar, revisarExistencias }) {
  const [catalogos, setCatalogos] = useState(null);
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useBorrador("insumos", "envio", false, () => false);
  const [incierto, setIncierto] = useState(false);
  const envio = useRef(false);

  useEffect(() => {
    const control = new AbortController();
    Promise.all([leer("/api/catalogos", control.signal), leer("/api/compras/proveedores", control.signal)])
      .then(([{ unidades }, { proveedores }]) => { if (!control.signal.aborted) setCatalogos({ unidades, proveedores }); })
      .catch(() => { if (!control.signal.aborted) setCatalogos({ error: "No se pudieron cargar las unidades y los proveedores." }); });
    return () => control.abort();
  }, [intento]);

  const unidad = catalogos?.unidades?.find((item) => item.ID_UNIDAD === Number(datos.unidadId));
  const proveedorId = datos.proveedorId || buscarProveedorPropio(catalogos?.proveedores)?.ID_PROVEEDOR || "";
  const proveedor = catalogos?.proveedores?.some((item) => item.ID_PROVEEDOR === Number(proveedorId));
  const decimalesStock = unidad?.PERMITE_DECIMALES === "N" ? 0 : 3;

  async function guardar(evento) {
    evento.preventDefault();
    if (envio.current || incierto) return;
    setError("");
    if (!datos.nombre.trim() || !unidad || !proveedor) return setError("Completa el nombre, la unidad y el proveedor.");
    for (const [campo, etiqueta] of cantidades) {
      const escala = campo === "costo" ? 2 : decimalesStock;
      const formato = escala ? new RegExp(`^\\d+(?:\\.\\d{1,${escala}})?$`) : /^\d+$/;
      if (!formato.test(datos[campo])) return setError(`${etiqueta}: ingresa un valor no negativo con ${escala ? `hasta ${escala} decimales` : "unidades enteras"}.`);
    }
    envio.current = true;
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/inventario/insumos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: datos.nombre.trim(), unidadId: unidad.ID_UNIDAD, proveedorId: Number(proveedorId),
          costo: Number(datos.costo), stockInicial: Number(datos.stockInicial), stockCritico: Number(datos.stockCritico),
          estado: datos.estado
        })
      });
      const resultado = await respuesta.json();
      if (!respuesta.ok && resultado.estado === "ERROR") {
        setError(resultado.mensaje);
        return;
      }
      if (!respuesta.ok || resultado.estado !== "OK" || !Number.isSafeInteger(resultado.idInsumo) || resultado.idInsumo <= 0) {
        throw new Error("Resultado incierto");
      }
      alGuardar(resultado.idInsumo);
    } catch {
      setIncierto(true);
      setError("No se pudo confirmar el alta. Revisa las existencias antes de volver a guardar.");
      revisarExistencias();
    } finally {
      envio.current = false;
      setGuardando(false);
    }
  }

  const editar = (evento) => {
    cambiar({ ...datos, [evento.target.name]: evento.target.value });
    if (!incierto) setError("");
  };

  return <section className="panel modulo-operacion nuevo-insumo" aria-labelledby="nuevo-insumo-titulo">
    <h2 id="nuevo-insumo-titulo">Nuevo insumo</h2>
    {!catalogos && <p role="status">Consultando unidades y proveedores…</p>}
    {catalogos?.error && <p role="alert">{catalogos.error} <button type="button" className="secundario" onClick={() => {
      setCatalogos(null);
      setIntento((n) => n + 1);
    }}>Reintentar</button></p>}
    {catalogos?.proveedores?.length === 0 && <p role="status">Todavía no hay proveedores. Registra uno para poder guardar el insumo.</p>}
    <form onSubmit={guardar} aria-busy={guardando}>
      <fieldset className="campos-producto inventario-campos" disabled={guardando}>
        <label>Nombre del insumo
          <input name="nombre" value={datos.nombre} onChange={editar} required />
        </label>
        <label>Unidad de medida
          <select name="unidadId" value={datos.unidadId} onChange={editar} required>
            <option value="">Selecciona una unidad</option>
            {catalogos?.unidades?.map((u) => <option key={u.ID_UNIDAD} value={u.ID_UNIDAD}>{u.NOMBRE_UNIDAD} · {u.CODIGO_UNIDAD}</option>)}
          </select>
        </label>
        <label>Proveedor
          <select name="proveedorId" value={proveedorId} onChange={editar} required>
            <option value="">Selecciona un proveedor</option>
            {catalogos?.proveedores?.map((p) => <option key={p.ID_PROVEEDOR} value={p.ID_PROVEEDOR}>{p.RAZON_SOCIAL}</option>)}
          </select>
        </label>
        {cantidades.map(([campo, etiqueta]) => <label key={campo}>{etiqueta}
          <input name={campo} type="number" min="0" step={campo === "costo" ? "0.01" : decimalesStock ? "0.001" : "1"}
            value={datos[campo]} onChange={editar} required />
        </label>)}
        <label>Activo
          <select name="estado" value={datos.estado} onChange={editar}><option value="S">Sí</option><option value="N">No</option></select>
        </label>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones-formulario">
        <button type="submit" disabled={!catalogos?.proveedores?.length || !catalogos?.unidades?.length || guardando || incierto}>
          {guardando ? "Guardando…" : "Guardar insumo"}
        </button>
        <button type="button" className="secundario" disabled={guardando} onClick={cancelar}>{incierto ? "Cerrar formulario" : "Cancelar"}</button>
        <button type="button" className="secundario" disabled={guardando || incierto} onClick={crearProveedor}>Registrar proveedor</button>
      </div>
    </form>
  </section>;
}
